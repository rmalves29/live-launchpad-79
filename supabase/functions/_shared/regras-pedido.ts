// Regras de desconto do pedido — UM lugar só (fase 1 da unificação dos checkouts, 21/11/2026).
//
// Antes, o checkout do sistema (/t/loja/checkout) fazia esta conta NA TELA e a cobrança confiava no valor enviado
// pelo navegador. Agora a cobrança (create-payment e create-infinitepay-payment) usa estas funções com dados do banco.
// A conta é a mesma da tela, linha a linha (tests/regras-pedido.test.mjs compara com o código original da tela).
//
// Cupom da Loja da Live continua em ./coupon-rules.ts (regras próprias: peça em promoção, cupom automático).

export type CupomCheckout = {
  discount_type: string | null;
  discount_value: number | null;
  progressive_tiers?: Array<{ min_value: number; max_value: number | null; discount: number }> | null;
  min_purchase_amount?: number | null;
  min_items_quantity?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active?: boolean | null;
  usage_limit?: number | null;
  used_count?: number | null;
};

export type ItemRegra = { preco: number; qtd: number; categoria?: string | number | null };
export type PedidoRegra = { created_at?: string | null; itens: ItemRegra[] };

export type ResultadoCupom = {
  ok: boolean;
  /** desconto sem arredondar (igual ao que a tela guardava) */
  desconto: number;
  /** pedido a pedido: entra no cupom (criado dentro da validade) */
  elegiveis: boolean[];
  motivo?: 'nao_iniciado' | 'expirado' | 'esgotado' | 'fora_da_validade' | 'valor_minimo' | 'quantidade_minima';
};

const ms = (iso?: string | null) => (iso ? new Date(iso).getTime() : null);

/**
 * Cupom do checkout do sistema sobre um ou mais pedidos pagos juntos.
 * `agoraMs` é o momento da conferência (na tela: ao aplicar; na cobrança: ao gerar o pagamento).
 * `limiteDeUso`: na cobrança o contador já foi somado pela tela, então o limite só barra quem PASSOU dele.
 */
export function avaliarCupomCheckout(
  cupom: CupomCheckout,
  pedidos: PedidoRegra[],
  agoraMs: number,
  limiteDeUso: 'tela' | 'cobranca' = 'tela',
): ResultadoCupom {
  const nada = (motivo: ResultadoCupom['motivo']): ResultadoCupom => ({ ok: false, desconto: 0, elegiveis: pedidos.map(() => false), motivo });
  const inicio = ms(cupom.starts_at);
  const fim = ms(cupom.expires_at);
  if (inicio !== null && inicio > agoraMs) return nada('nao_iniciado');
  if (fim !== null && fim < agoraMs) return nada('expirado');
  const usados = Number(cupom.used_count ?? 0);
  if (cupom.usage_limit) {
    const limite = Number(cupom.usage_limit);
    if (limiteDeUso === 'tela' ? usados >= limite : usados > limite) return nada('esgotado');
  }

  // o cupom só vale para pedidos criados DENTRO do período de validade
  const elegiveis = pedidos.map((p) => {
    if (!p.created_at) return true;
    const t = new Date(p.created_at).getTime();
    if (Number.isNaN(t)) return true;
    if (inicio !== null && t < inicio) return false;
    if (fim !== null && t > fim) return false;
    return true;
  });
  if (!elegiveis.some(Boolean)) return nada('fora_da_validade');

  const base = pedidos.filter((_, i) => elegiveis[i]);
  const produtos = base.reduce((t, p) => t + p.itens.reduce((s, it) => s + Number(it.preco) * it.qtd, 0), 0);
  const pecas = base.reduce((t, p) => t + p.itens.reduce((s, it) => s + Number(it.qtd || 0), 0), 0);

  // condição mínima (não vale para progressivo) — só sobre produtos
  if (cupom.discount_type !== 'progressive') {
    const minimo = cupom.min_purchase_amount;
    const minPecas = cupom.min_items_quantity;
    if (minimo != null && Number(minimo) > 0 && produtos < Number(minimo)) return { ...nada('valor_minimo'), elegiveis };
    if (minPecas != null && Number(minPecas) > 0 && pecas < Number(minPecas)) return { ...nada('quantidade_minima'), elegiveis };
  }

  let desconto = 0;
  if (cupom.discount_type === 'progressive') {
    const faixa = cupom.progressive_tiers?.find((f) =>
      f.max_value === null ? produtos >= f.min_value : produtos >= f.min_value && produtos <= f.max_value);
    if (faixa) desconto = (produtos * faixa.discount) / 100;
  } else if (cupom.discount_type === 'percentage') {
    desconto = (produtos * Number(cupom.discount_value)) / 100;
  } else if (cupom.discount_type === 'fixed') {
    desconto = Math.min(Number(cupom.discount_value), produtos);
  }
  return { ok: true, desconto, elegiveis };
}

export type Promocao = {
  name?: string;
  category_id: string | number | null;
  promotion_type?: string | null;
  buy_qty?: number | null;
  get_qty?: number | null;
  discount_percent?: number | null;
  tiers?: Array<{ qty: number; percent: number }> | null;
};

/** "Leve X pague Y" e promoção progressiva por quantidade, por categoria (mesma conta da tela). */
export function descontoPromocao(itens: ItemRegra[], promocoes: Promocao[]): { total: number; linhas: Array<{ nome?: string; desconto: number; gratis: number }> } {
  if (!itens?.length || !promocoes?.length) return { total: 0, linhas: [] };
  const porCategoria: Record<string, number[]> = {};
  for (const it of itens) {
    if (it.categoria == null || it.categoria === '') continue;
    const preco = Number(it.preco) || 0;
    const qtd = Number(it.qtd) || 0;
    const k = String(it.categoria);
    if (!porCategoria[k]) porCategoria[k] = [];
    for (let i = 0; i < qtd; i++) porCategoria[k].push(preco);
  }
  let total = 0;
  const linhas: Array<{ nome?: string; desconto: number; gratis: number }> = [];
  for (const promo of promocoes) {
    const unidades = porCategoria[String(promo.category_id)];
    if (!unidades || unidades.length === 0) continue;

    if (promo.promotion_type === 'progressive_qty') {
      const faixas = Array.isArray(promo.tiers) ? [...promo.tiers].sort((a, b) => Number(b.qty) - Number(a.qty)) : [];
      if (faixas.length === 0) continue;
      const qtd = unidades.length;
      const subtotal = unidades.reduce((s, v) => s + v, 0);
      const faixa = faixas.find((f) => qtd >= Number(f.qty));
      if (!faixa) continue;
      const pct = Math.min(100, Math.max(0, Number(faixa.percent) || 0)) / 100;
      const d = Math.round(subtotal * pct * 100) / 100;
      if (d > 0) { total += d; linhas.push({ nome: promo.name, desconto: d, gratis: 0 }); }
      continue;
    }

    const ordenadas = [...unidades].sort((a, b) => a - b); // mais baratas primeiro
    const grupo = (promo.buy_qty || 1) + (promo.get_qty || 1);
    const grupos = Math.floor(ordenadas.length / grupo);
    if (grupos <= 0) continue;
    const gratis = grupos * (promo.get_qty || 1);
    const pct = Math.min(100, Math.max(0, Number(promo.discount_percent) || 100)) / 100;
    let d = 0;
    for (let i = 0; i < gratis; i++) d += ordenadas[i] * pct;
    d = Math.round(d * 100) / 100;
    if (d > 0) { total += d; linhas.push({ nome: promo.name, desconto: d, gratis }); }
  }
  return { total: Math.round(total * 100) / 100, linhas };
}

/** Promoções no ar agora (mesmo filtro da tela). */
export function promocoesNoAr<T extends { starts_at?: string | null; ends_at?: string | null }>(lista: T[], agoraIso: string): T[] {
  return (lista || []).filter((p) => (!p.starts_at || p.starts_at <= agoraIso) && (!p.ends_at || p.ends_at >= agoraIso));
}

/**
 * Valores que vão para o gateway (centavos), com a soma EXATA igual ao alvo.
 * Reparte o desconto pelos itens na proporção do valor de cada um; quando o valor de uma linha não divide pela
 * quantidade, a linha vira duas (ex.: 2 un. a R$ 9,98 + 1 un. a R$ 9,99) para o total bater no centavo.
 * Linhas que ficam em R$ 0,00 saem (cupom de 100%).
 */
export function itensParaGateway<T extends { qtd: number; centavos: number }>(linhas: T[], alvoCentavos: number): Array<T & { qtd: number; centavos: number }> {
  const validas = linhas.filter((l) => l.qtd > 0 && l.centavos > 0);
  const cheio = validas.reduce((s, l) => s + l.centavos * l.qtd, 0);
  const alvo = Math.max(0, Math.min(Math.round(alvoCentavos), cheio));
  if (cheio === 0) return [];
  // alvo por linha (maiores restos), soma exata = alvo
  const brutos = validas.map((l) => (l.centavos * l.qtd * alvo) / cheio);
  const base = brutos.map((v) => Math.floor(v));
  let falta = alvo - base.reduce((s, v) => s + v, 0);
  const ordem = brutos.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < ordem.length && falta > 0; k++, falta--) base[ordem[k][1]] += 1;

  const saida: Array<T & { qtd: number; centavos: number }> = [];
  validas.forEach((l, i) => {
    const totalLinha = base[i];
    if (totalLinha <= 0) return;
    const unit = Math.floor(totalLinha / l.qtd);
    const sobra = totalLinha - unit * l.qtd; // 0..qtd-1 unidades levam 1 centavo a mais
    if (unit > 0 && l.qtd - sobra > 0) saida.push({ ...l, qtd: l.qtd - sobra, centavos: unit });
    if (sobra > 0) saida.push({ ...l, qtd: sobra, centavos: unit + 1 });
  });
  return saida;
}
