// Cobrança dos pedidos — conta feita SÓ no servidor (fase 1 da unificação dos checkouts, 21/11/2026).
// Usada pela create-payment e pela create-infinitepay-payment: as duas leem do banco e chegam ao mesmo valor.
//
// O que mudou em relação a antes:
//  * o desconto de cupom e de promoção é recalculado aqui; o valor enviado pelo navegador é ignorado (fecha a fraude);
//  * o desconto do cupom não é reduzido de novo quando um dos pedidos pagos juntos é anterior à validade
//    (a tela já calcula só sobre os pedidos dentro da validade; antes a cliente pagava a mais);
//  * os itens enviados ao gateway somam EXATAMENTE o total dos pedidos (antes sobravam/faltavam centavos e, com
//    cupom de 100% + Pix, o Mercado Pago recebia valor errado, até negativo).
import { pixDiscountPerOrder } from "./order-totals.ts";
import { avaliarCupomCheckout, descontoPromocao, itensParaGateway, promocoesNoAr, type ItemRegra } from "./regras-pedido.ts";

export type ItemPedido = ItemRegra & { nome: string; codigo: string };

export type PedidoCobranca = {
  id: number;
  observation: string | null;
  cart_id: number | null;
  created_at: string | null;
  source: string | null;
  coupon_code: string | null;
  coupon_discount: number | null;
  productsTotal: number;
  itens: ItemPedido[];
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Pedidos (mais antigo primeiro — o frete fica no primeiro) com os itens do carrinho e a categoria de cada produto. */
export async function carregarPedidosParaCobranca(sb: any, orderIds: number[]): Promise<PedidoCobranca[]> {
  const { data: orders } = await sb
    .from("orders")
    .select("id, observation, total_amount, cart_id, created_at, source, coupon_code, coupon_discount")
    .in("id", orderIds);
  const lista = (orders || []) as any[];
  const cartIds = [...new Set(lista.map((o) => o.cart_id).filter(Boolean))];
  const itensPorCarrinho = new Map<number, any[]>();
  if (cartIds.length > 0) {
    const { data: itens } = await sb
      .from("cart_items")
      .select("cart_id, unit_price, qty, product_id, product_name, product_code")
      .in("cart_id", cartIds);
    for (const it of itens || []) {
      if (!itensPorCarrinho.has(it.cart_id)) itensPorCarrinho.set(it.cart_id, []);
      itensPorCarrinho.get(it.cart_id)!.push(it);
    }
  }
  const productIds = [...new Set([...itensPorCarrinho.values()].flat().map((it) => it.product_id).filter(Boolean))];
  const categoria = new Map<number, unknown>();
  if (productIds.length > 0) {
    const { data: produtos } = await sb.from("products").select("id, category_id").in("id", productIds);
    for (const p of produtos || []) categoria.set(p.id, p.category_id ?? null);
  }

  const pedidos: PedidoCobranca[] = lista.map((o) => {
    const itens = (o.cart_id ? itensPorCarrinho.get(o.cart_id) || [] : []).map((it: any) => ({
      preco: num(it.unit_price),
      qtd: num(it.qty),
      categoria: (categoria.get(it.product_id) as any) ?? null,
      nome: it.product_name || it.product_code || "Produto",
      codigo: it.product_code || "",
    }));
    return {
      id: o.id, observation: o.observation, cart_id: o.cart_id, created_at: o.created_at ?? null,
      source: o.source ?? null, coupon_code: o.coupon_code ?? null, coupon_discount: o.coupon_discount ?? null,
      productsTotal: itens.reduce((s: number, it: ItemPedido) => s + it.preco * it.qtd, 0),
      itens,
    };
  });
  pedidos.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : a.id;
    const tb = b.created_at ? Date.parse(b.created_at) : b.id;
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
  return pedidos;
}

export type DescontoServidor = {
  /** desconto total de produtos (cupom + promoção), em reais, arredondado como a tela enviava */
  valor: number;
  cupom: number;
  promocao: number;
  /** código gravado no pedido ("CUPOM", "CUPOM+BOGO", "BOGO" ou o código da Loja da Live) */
  codigo: string | null;
  /** pedido a pedido: recebe parte do desconto */
  elegiveis: boolean[];
  origem: "loja_da_live" | "checkout";
};

/**
 * Desconto de produtos decidido pelo servidor.
 *  - Loja da Live: o desconto foi calculado pelo servidor da Loja da Live na criação do pedido e está gravado nele.
 *  - Checkout do sistema: recalcula o cupom (canal diferente de "live") e a promoção "leve X pague Y"/progressiva.
 * O valor que o navegador manda não entra na conta.
 */
export async function calcularDescontoDoServidor(sb: any, params: {
  tenantId: string;
  pedidos: PedidoCobranca[];
  codigoEnviado: string | null | undefined;
  agoraMs?: number;
}): Promise<DescontoServidor> {
  const { tenantId, pedidos } = params;
  const agoraMs = params.agoraMs ?? Date.now();
  const todos = pedidos.map(() => true);

  if (pedidos.length > 0 && pedidos.every((p) => p.source === "live_shop")) {
    const valor = r2(pedidos.reduce((s, p) => s + num(p.coupon_discount), 0));
    return { valor, cupom: valor, promocao: 0, codigo: pedidos.find((p) => p.coupon_code)?.coupon_code ?? null, elegiveis: todos, origem: "loja_da_live" };
  }

  // cupom do checkout (o rótulo "X+BOGO" que a tela manda vira só "X")
  let cupom = 0;
  let elegiveisCupom = todos;
  let codigoCupom: string | null = null;
  const base = String(params.codigoEnviado ?? "").split("+")[0].trim().toUpperCase();
  if (base && base !== "BOGO") {
    const { data: c } = await sb
      .from("coupons")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("code", base)
      .eq("is_active", true)
      .neq("channel", "live")
      .maybeSingle();
    if (c) {
      const r = avaliarCupomCheckout(c, pedidos.map((p) => ({ created_at: p.created_at, itens: p.itens })), agoraMs, "cobranca");
      if (r.ok) { cupom = r.desconto; elegiveisCupom = r.elegiveis; codigoCupom = c.code; }
    }
  }

  // promoção por categoria, sobre todas as peças dos pedidos pagos juntos
  let promocao = 0;
  const { data: promos } = await sb
    .from("product_promotions")
    .select("id, name, category_id, promotion_type, buy_qty, get_qty, discount_percent, tiers, starts_at, ends_at, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  const noAr = promocoesNoAr((promos || []) as any[], new Date(agoraMs).toISOString());
  if (noAr.length) promocao = descontoPromocao(pedidos.flatMap((p) => p.itens), noAr).total;

  const valor = Math.round((cupom + promocao) * 100) / 100;
  const codigo = promocao > 0 ? (codigoCupom ? `${codigoCupom}+BOGO` : "BOGO") : codigoCupom;
  // promoção vale para todos os pedidos; sem promoção, o cupom só entra nos pedidos dentro da validade
  const elegiveis = promocao > 0 ? todos : elegiveisCupom;
  return { valor, cupom, promocao, codigo, elegiveis, origem: "checkout" };
}

export type ParcelaPedido = { id: number; produtos: number; pix: number; cupom: number; frete: number; total: number };

/**
 * Reparte Pix, desconto e frete entre os pedidos pagos juntos (mesma conta de antes):
 * Pix = % sobre o subtotal de cada pedido; desconto rateado só entre os elegíveis (o último elegível leva os centavos
 * que sobram); frete inteiro no pedido mais antigo. Total do pedido nunca fica negativo antes do frete.
 */
export function repartirCobranca(params: {
  pedidos: PedidoCobranca[];
  desconto: number;
  elegiveis: boolean[];
  pixPercent: number;
  frete: number;
  /** soma dos itens enviada pela tela: só para pedido sem itens no banco (caso antigo) */
  subtotalReserva: number;
}): ParcelaPedido[] {
  const { pedidos, desconto, elegiveis, pixPercent, frete, subtotalReserva } = params;
  const elegivelSubtotal = pedidos.reduce((s, p, i) => s + (elegiveis[i] ? p.productsTotal : 0), 0);
  let resto = Math.round(desconto * 100);
  const ultimo = elegiveis.lastIndexOf(true);
  return pedidos.map((p, i) => {
    const baseParaPix = p.productsTotal > 0 ? p.productsTotal : (pedidos.length === 1 ? subtotalReserva : 0);
    const pix = pixDiscountPerOrder([baseParaPix], pixPercent)[0];
    let cupom = 0;
    if (elegiveis[i]) {
      if (elegivelSubtotal <= 0 || pedidos.length === 1 || i === ultimo) {
        if (i === ultimo) { cupom = resto / 100; resto = 0; }
      } else {
        const cents = Math.round(desconto * 100 * (p.productsTotal / elegivelSubtotal));
        cupom = cents / 100;
        resto -= cents;
      }
    }
    const produtos = p.productsTotal > 0 ? p.productsTotal : subtotalReserva;
    const freteDoPedido = i === 0 ? frete : 0;
    return { id: p.id, produtos, pix, cupom, frete: freteDoPedido, total: Math.max(0, produtos - pix - cupom) + freteDoPedido };
  });
}

/**
 * Itens para o gateway: peças do banco com o desconto repartido e o frete separado.
 * A soma é exatamente a soma dos totais dos pedidos. Sem itens no banco, usa os itens enviados (caso antigo).
 */
export function itensDaCobranca(
  pedidos: PedidoCobranca[],
  parcelas: ParcelaPedido[],
  reserva: Array<{ product_name?: string; product_code?: string; qty: number; unit_price: number }>,
): { produtos: Array<{ nome: string; codigo: string; qtd: number; centavos: number }>; freteCentavos: number; totalCentavos: number } {
  const doBanco = pedidos.flatMap((p) => p.itens);
  const linhas = (doBanco.length ? doBanco : reserva.map((it) => ({ nome: it.product_name || it.product_code || "Produto", codigo: it.product_code || "", preco: num(it.unit_price), qtd: num(it.qty) })))
    .filter((l) => l.preco > 0 && l.qtd > 0)
    .map((l) => ({ nome: l.nome, codigo: l.codigo, qtd: l.qtd, centavos: Math.round(l.preco * 100) }));
  const alvoProdutos = parcelas.reduce((s, p) => s + Math.round(Math.max(0, p.produtos - p.pix - p.cupom) * 100), 0);
  const produtos = itensParaGateway(linhas, alvoProdutos);
  const freteCentavos = parcelas.reduce((s, p) => s + Math.round(p.frete * 100), 0);
  return { produtos, freteCentavos, totalCentavos: produtos.reduce((s, l) => s + l.centavos * l.qtd, 0) + freteCentavos };
}
