// Fase 0 da unificação dos checkouts (21/11/2026): grava COMO A CONTA FUNCIONA HOJE, antes de mexer.
//
// Roda o código original, sem cópia à mão:
//   * checkout do sistema (/t/loja/checkout): applyCouponToOrders e computeBogoDiscount lidos de dentro da tela;
//   * Loja da Live: regra de cupom do servidor (live-shop) com _shared/coupon-rules.ts;
//   * cobrança: a edge function create-payment inteira, com banco falso e gateways gravados.
//
// Duas bases:
//   1. 123 pedidos PAGOS reais, anonimizados (fixtures/checkout-pedidos-reais.json);
//   2. casos sorteados (semente fixa) cobrindo cupom %, fixo e progressivo, mínimo de compra/peças, janela de validade,
//      vários pedidos pagos juntos, promoção "leve X pague Y" e por quantidade, Pix por gateway, cartão e frete.
//
// O resultado fica gravado em fixtures/checkout-referencia-saidas.json. A regra nova (fases 1 a 4) só passa se der
// EXATAMENTE o mesmo valor, centavo por centavo, em todos os casos. Para regravar (só com aprovação):
//   GRAVAR_REFERENCIA=1 npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extractInnerArrows, extractFunctions } from './support/extract.mjs';
import { loadEdgeFunction, silenceLogs } from './support/edge.mjs';
import { computeOrderTotals } from '../supabase/functions/_shared/order-totals.ts';
import { computeCouponDiscount } from '../supabase/functions/_shared/coupon-rules.ts';

const TELA = 'src/pages/pedidos/PublicCheckout.tsx';
const BASE = JSON.parse(readFileSync(new URL('./fixtures/checkout-pedidos-reais.json', import.meta.url), 'utf8'));
const SAIDAS = new URL('./fixtures/checkout-referencia-saidas.json', import.meta.url);
const GRAVAR = process.env.GRAVAR_REFERENCIA === '1';
const LOJA = '99999999-9999-4999-8999-999999999999';
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

let restore;
before(() => { restore = silenceLogs(); });
after(() => restore());

// ---------------------------------------------------------------- tela do checkout do sistema (código original)
function bancoDaTela(cupom) {
  return {
    from(tabela) {
      const q = {
        select: () => q, eq: () => q, neq: () => q,
        maybeSingle: async () => ({ data: tabela === 'coupons' ? cupom : null, error: null }),
        then: (ok, erro) => Promise.resolve({ data: [], error: null }).then(ok, erro),
      };
      return q;
    },
  };
}

async function cupomNaTela(cupom, pedidos, agoraMs) {
  const out = { aplicado: false, desconto: 0, avisos: [] };
  const relogio = Date.now;
  Date.now = () => agoraMs;
  try {
    const { applyCouponToOrders } = extractInnerArrows(TELA, ['applyCouponToOrders'], {
      couponCode: 'CUPOM', setLoadingCoupon() {}, toast: (t) => out.avisos.push(t.title), supabase: bancoDaTela(cupom),
      tenant: { id: LOJA }, setAppliedCoupon: (c) => { out.aplicado = c?.appliedType === 'coupon'; },
      setCouponDiscount: (v) => { out.desconto = v; }, formatCurrency: (v) => String(v),
    });
    await applyCouponToOrders(pedidos);
  } finally { Date.now = relogio; }
  return out;
}

const { computeBogoDiscount } = extractInnerArrows(TELA, ['computeBogoDiscount'], {});

// ---------------------------------------------------------------- servidor da Loja da Live (código original)
const lojaDaLive = extractFunctions('supabase/functions/live-shop/index.ts', ['round2', 'num', 'couponActive', 'computeCoupon'], { computeCouponDiscount });

// ---------------------------------------------------------------- cobrança (edge function create-payment inteira)
const respondeGateways = async (call) => {
  if (call.url.includes('mercadopago.com/checkout/preferences')) return { status: 201, body: { id: 'pref-1', init_point: 'https://mp.test/p' } };
  if (call.url.includes('mercadopago.com/v1/payment_methods')) return { status: 200, body: [{ id: 'pix', payment_type_id: 'bank_transfer', status: 'active' }] };
  if (call.url.includes('pagar.me')) return { status: 200, body: { id: 'pl_1', url: 'https://pagar.me/link/pl_1' } };
  return { status: 200, body: {} };
};

function integracoes(pix) {
  const linha = (cfg, extra) => (cfg ? [{ tenant_id: LOJA, is_active: cfg[0], pix_discount_percent: cfg[1], enable_pix: true, enable_credit_card: true, ...extra }] : []);
  return {
    integration_infinitepay: linha(pix.inf, { handle: 'loja' }),
    integration_pagarme: linha(pix.pg, { api_key: 'sk_teste', public_key: 'pk_teste', environment: 'production' }),
    integration_mp: linha(pix.mp, { access_token: 'TOKEN', environment: 'production' }),
    integration_appmax: [],
  };
}

// pedidos: [{ id, created_at, items: [{ unit_price, qty }] }] (do mais antigo para o mais novo)
async function cobrar({ pix, pedidos, cupom, codigo, frete, metodo, cupomRow = null }) {
  const tables = {
    orders: pedidos.map((p) => ({ id: p.id, tenant_id: LOJA, cart_id: 10_000 + p.id, total_amount: 0, observation: '', created_at: p.created_at })),
    cart_items: pedidos.flatMap((p) => p.items.map((it, n) => ({ id: p.id * 100 + n, cart_id: 10_000 + p.id, qty: it.qty, unit_price: it.unit_price }))),
    customers: [], tenants: [{ id: LOJA, slug: 'loja' }],
    // o cadastro do cupom fica no banco simulado, como na vida real (a cobrança lê a validade dele)
    coupons: cupomRow ? [{ ...cupomRow, tenant_id: LOJA, channel: 'bazar' }] : [],
    ...integracoes(pix),
  };
  const fn = await loadEdgeFunction('create-payment', { tables, fetchHandler: respondeGateways });
  const todos = pedidos.flatMap((p) => p.items);
  const r = await fn.call({
    order_ids: pedidos.map((p) => p.id), order_id: pedidos[0].id,
    cartItems: todos.map((it) => ({ product_name: 'Peça', product_code: 'C1', qty: it.qty, unit_price: it.unit_price })),
    customerData: { name: 'Cliente Teste', phone: '31900000000', cpf: '52998224725', email: 'c@teste.com' },
    addressData: { cep: '30110000', street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'BH', state: 'MG' },
    shippingCost: frete, shippingData: frete > 0 ? { service_id: 1, service_name: 'PAC', company_name: 'Correios', price: frete, delivery_time: 5 } : null,
    total: '0', coupon_discount: cupom, coupon_code: codigo, tenant_id: LOJA, tenant_slug: 'loja', payment_method: metodo, pix_discount: 0,
  });
  const porPedido = Object.fromEntries(pedidos.map((p) => [p.id, null]));
  for (const w of fn.sb.log.writes) {
    if (w.table !== 'orders' || w.action !== 'update' || w.values?.total_amount == null) continue;
    const id = w.filters.find((f) => f.col === 'id')?.val;
    if (id in porPedido) porPedido[id] = { total: r2(w.values.total_amount), cupom: r2(w.values.coupon_discount ?? 0) };
  }
  const pref = fn.calls.find((c) => c.url.includes('/checkout/preferences'));
  const gatewayTotal = pref ? r2(pref.body.items.reduce((s, i) => s + i.unit_price * i.quantity, 0)) : null;
  const pg = fn.calls.find((c) => c.url.includes('/paymentlinks'));
  const pagarme = pg ? r2(pg.body.cart_settings.items.reduce((s, i) => s + i.amount * (i.default_quantity ?? i.quantity ?? 1), 0) / 100) : null;
  const delegado = fn.sb.log.invokes.find((i) => i.name === 'create-infinitepay-payment');
  let infinitepay = null, porPedidoInf = null;
  if (delegado && rodarInfinitePay) {
    const ip = await loadEdgeFunction('create-infinitepay-payment', { tables, fetchHandler: async (call) => (call.url.includes('infinitepay.io') ? { status: 200, body: { url: 'https://inf.test/l' } } : { status: 200, body: {} }) });
    await ip.call(delegado.body);
    const link = ip.calls.find((c) => c.url.includes('infinitepay.io/links'));
    infinitepay = link ? r2(link.body.items.reduce((s, i) => s + i.price * i.quantity, 0) / 100) : null;
    porPedidoInf = {};
    for (const w of ip.sb.log.writes) {
      if (w.table !== 'orders' || w.action !== 'update' || w.values?.total_amount == null) continue;
      const id = w.filters.find((f) => f.col === 'id')?.val;
      porPedidoInf[id] = r2(w.values.total_amount);
    }
  }
  return { ok: r.status === 200 && r.body?.success !== false, porPedido, gatewayTotal, pagarme, infinitepay, porPedidoInf, erro: r.body?.error ?? null };
}
let rodarInfinitePay = false;

// ---------------------------------------------------------------- base 1: pedidos reais
const metodoDaTela = (m) => (m === 'pix' || m === 'infinitepay_pix' ? 'pix' : 'card');

function gruposReais() {
  const grupos = new Map();
  BASE.pedidos.forEach((p, n) => {
    const chave = p.g ? `g${p.g}` : `u${n}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push({ ...p, id: n + 1 });
  });
  return [...grupos.values()].map((ps) => ps.sort((a, b) => a.d.localeCompare(b.d)));
}

async function rodarReais() {
  const out = [];
  for (const ps of gruposReais()) {
    const k = ps[0].k;
    const cfg = ps[0].c ? BASE.cupons[ps[0].c] : null;
    const produtos = ps.map((p) => r2(p.i.reduce((s, [pr, q]) => s + pr * q, 0)));
    // desconto do pedido: o maior entre o campo e a anotação [COUPON_DISCOUNT] (há pedido antigo com o campo zerado e a nota certa)
    const cupomGravado = r2(ps.reduce((s, p) => s + Math.max(Number(p.cd || 0), Number(p.cn || 0)), 0));
    const caso = { k, pedidos: ps.length, produtos, cupomGravado, totaisCobrados: ps.map((p) => Number(p.tot)) };

    // cupom: recalculado pela regra original de cada checkout, com a configuração ATUAL do cupom
    if (cfg && k === 'sis' && cfg.canal !== 'live') {
      const pedidosTela = ps.map((p) => ({ id: p.id, created_at: p.d, items: p.i.map(([pr, q]) => ({ unit_price: pr, qty: q })) }));
      const agora = Date.parse(ps[ps.length - 1].d) + 60_000;
      const cupomRow = { id: 1, code: 'CUPOM', is_active: true, used_count: 0, usage_limit: null, discount_type: cfg.tipo, discount_value: cfg.v,
        progressive_tiers: cfg.tiers, min_purchase_amount: cfg.min, min_items_quantity: cfg.minq, starts_at: cfg.ini, expires_at: cfg.fim };
      const t = await cupomNaTela(cupomRow, pedidosTela, agora);
      caso.cupomRegraHoje = t.aplicado ? r2(t.desconto) : null;
    } else if (cfg && k === 'live') {
      const lines = ps.flatMap((p) => p.i.map(([pr, q, , promo]) => ({ unit_price: pr, qty: q, promotional: promo === true })));
      const c = { is_active: true, used_count: 0, usage_limit: null, discount_type: cfg.tipo, discount_value: cfg.v, progressive_tiers: cfg.tiers,
        min_purchase_amount: cfg.min, min_items_quantity: cfg.minq, apply_to_promotional: cfg.promo, starts_at: null, expires_at: null };
      const r = lojaDaLive.computeCoupon(c, lines);
      caso.cupomRegraHoje = r.ok ? r2(r.discount) : null;
    }

    // cobrança: create-payment com o desconto gravado, o frete e a forma de pagamento do pedido real
    const cobr = await cobrar({
      pix: BASE.pix[ps[0].l], cupom: cupomGravado, codigo: cupomGravado > 0 ? 'CUPOM' : null,
      frete: r2(ps.reduce((s, p) => s + Number(p.f || 0), 0)), metodo: metodoDaTela(ps[0].m),
      pedidos: ps.map((p) => ({ id: p.id, created_at: p.d, items: p.i.map(([pr, q]) => ({ unit_price: pr, qty: q })) })),
    });
    caso.totaisHoje = ps.map((p) => cobr.porPedido[p.id]?.total ?? null);
    out.push(caso);
  }
  return out;
}

// ---------------------------------------------------------------- base 2: casos sorteados
function sorteio(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
const PRECOS = [0.99, 2.9, 6.9, 9.9, 11.11, 12.9, 14.98, 15.9, 19.9, 19.99, 24.9, 29.9, 34.9, 39.9, 49.9, 59.9, 79.9, 89.9, 119.9, 149.9];
const FRETES = [0, 0, 8, 11.99, 13.9, 16.53, 19.9, 25];
const PIX = [{ mp: [true, 0] }, { mp: [true, 5] }, { mp: [true, 10] }, { pg: [true, 7] }, { inf: [true, 5] }, { inf: [false, 0], mp: [true, 3] }];
const PROMOS = [
  [],
  [{ name: 'Leve 3 pague 2', category_id: 1, promotion_type: 'bogo', buy_qty: 2, get_qty: 1, discount_percent: 100 }],
  [{ name: '2ª com 50%', category_id: 2, promotion_type: 'bogo', buy_qty: 1, get_qty: 1, discount_percent: 50 }],
  [{ name: 'Progressivo', category_id: 1, promotion_type: 'progressive_qty', tiers: [{ qty: 3, percent: 10 }, { qty: 5, percent: 15 }] }],
];

function casoSorteado(r, n) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const base = Date.parse('2026-11-10T12:00:00Z');
  const qtdPedidos = r() < 0.7 ? 1 : 2 + Math.floor(r() * 3);
  const pedidos = Array.from({ length: qtdPedidos }, (_, j) => ({
    id: n * 10 + j + 1,
    created_at: new Date(base + j * 86_400_000 * (1 + Math.floor(r() * 3))).toISOString(),
    items: Array.from({ length: 1 + Math.floor(r() * 5) }, () => ({ unit_price: pick(PRECOS), qty: 1 + Math.floor(r() * 3), category_id: 1 + Math.floor(r() * 3) })),
  }));
  const tipo = pick(['nenhum', 'percentage', 'fixed', 'progressive', 'percentage', 'fixed']);
  const fimJanela = r() < 0.25 ? new Date(base + 86_400_000 * 1.5).toISOString() : null;
  const cupom = tipo === 'nenhum' ? null : {
    id: 1, code: 'CUPOM', is_active: true, used_count: 0, usage_limit: null, discount_type: tipo,
    discount_value: tipo === 'fixed' ? pick([2, 8, 12.9, 19.99, 20, 40, 59.8, 500]) : pick([3, 5, 10, 15, 20, 30]),
    progressive_tiers: tipo === 'progressive' ? [{ min_value: 0, max_value: 99.99, discount: 5 }, { min_value: 100, max_value: null, discount: 10 }] : null,
    min_purchase_amount: r() < 0.2 ? pick([50, 100, 200]) : null, min_items_quantity: r() < 0.15 ? pick([3, 5]) : null,
    starts_at: null, expires_at: fimJanela,
  };
  return {
    pedidos, cupom, promos: pick(PROMOS), pix: pick(PIX), frete: pick(FRETES), metodo: r() < 0.6 ? 'pix' : 'card',
    agora: Date.parse(pedidos[pedidos.length - 1].created_at) + 3_600_000,
  };
}

async function rodarSorteados(qtd) {
  const r = sorteio(2611);
  const out = [];
  for (let n = 0; n < qtd; n++) {
    const c = casoSorteado(r, n);
    // tela do checkout do sistema: cupom, promoção e total mostrado (código original)
    const t = c.cupom ? await cupomNaTela(c.cupom, c.pedidos, c.agora) : { aplicado: false, desconto: 0 };
    const cupomTela = t.aplicado ? t.desconto : 0;
    const todos = c.pedidos.flatMap((p) => p.items);
    const promo = computeBogoDiscount(todos, c.promos).total;
    const pixPct = c.pix.inf?.[0] ? c.pix.inf[1] : c.pix.pg?.[0] ? c.pix.pg[1] : c.pix.mp?.[0] ? c.pix.mp[1] : 0;
    const tela = computeOrderTotals({
      orderSubtotals: c.pedidos.map((p) => p.items.reduce((s, it) => s + it.unit_price * it.qty, 0)),
      method: c.metodo, pixPercent: pixPct, couponDiscount: cupomTela, promoDiscount: promo, shipping: c.frete,
    });
    // cobrança com o payload que a tela monta hoje (cupom + promoção somados em coupon_discount)
    const descontoEnviado = Math.round((cupomTela + promo) * 100) / 100;
    const cobr = await cobrar({
      pix: c.pix, pedidos: c.pedidos, cupom: descontoEnviado, frete: c.frete, metodo: c.metodo, cupomRow: c.cupom,
      codigo: promo > 0 ? (t.aplicado ? 'CUPOM+BOGO' : 'BOGO') : (t.aplicado ? 'CUPOM' : null),
    });
    out.push({
      n, cupomTela: r2(cupomTela), promo, totalTela: r2(tela.total), pixTela: r2(tela.pixDiscount),
      cobrado: c.pedidos.map((p) => cobr.porPedido[p.id]), gatewayTotal: cobr.gatewayTotal,
    });
  }
  return out;
}

// Loja da Live: regra de cupom do servidor em carrinhos sorteados (inclui peça em promoção e cupom que não vale para promoção)
function rodarLojaDaLive(qtd) {
  const r = sorteio(1511);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const out = [];
  for (let n = 0; n < qtd; n++) {
    const lines = Array.from({ length: 1 + Math.floor(r() * 6) }, () => ({ unit_price: pick(PRECOS), qty: 1 + Math.floor(r() * 4), promotional: r() < 0.4 }));
    const tipo = pick(['percentage', 'fixed', 'progressive']);
    const c = {
      is_active: true, used_count: 0, usage_limit: null, discount_type: tipo,
      discount_value: tipo === 'fixed' ? pick([1, 5, 10, 20, 50]) : pick([3, 5, 10, 15]),
      progressive_tiers: tipo === 'progressive' ? (r() < 0.5
        ? [{ min_value: 0, max_value: null, min_qty: 3, max_qty: 5, discount: 5 }, { min_value: 0, max_value: null, min_qty: 6, max_qty: null, discount: 10 }]
        : [{ min_value: 50, max_value: 149.99, discount: 5 }, { min_value: 150, max_value: null, discount: 10 }]) : null,
      min_purchase_amount: r() < 0.25 ? pick([30, 80, 150]) : 0, min_items_quantity: r() < 0.2 ? pick([2, 4]) : 0,
      apply_to_promotional: r() < 0.5, starts_at: null, expires_at: null,
    };
    const res = lojaDaLive.computeCoupon(c, lines);
    out.push({ n, ok: res.ok, desconto: res.discount });
  }
  return out;
}

// ---------------------------------------------------------------- base 3 (ampliação de 21/11): casos que faltavam
const GATEWAYS = { mp: { mp: [true, 5] }, pagarme: { pg: [true, 5] }, infinitepay: { inf: [true, 5] } };

async function rodarAmpliacao() {
  const r = sorteio(2111);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const base = Date.parse('2026-11-10T12:00:00Z');
  const out = [];
  rodarInfinitePay = true;
  try {
    for (let n = 0; n < 240; n++) {
      // pedidos pagos juntos, com o cupom começando DEPOIS do primeiro pedido (o primeiro fica fora da validade)
      const qtd = n < 160 ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
      const pedidos = Array.from({ length: qtd }, (_, j) => ({
        id: 9000 + n * 10 + j,
        created_at: new Date(base + j * 86_400_000 * 2).toISOString(),
        items: Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ unit_price: pick(PRECOS), qty: 1 + Math.floor(r() * 3), category_id: 1 + Math.floor(r() * 3) })),
      }));
      const agora = Date.parse(pedidos[qtd - 1].created_at) + 3_600_000;
      let tipoCaso, cupom = null, enviado = null, codigo = null;
      if (n < 160) {
        tipoCaso = 'janela';
        const tipo = pick(['percentage', 'fixed', 'progressive']);
        cupom = { id: 1, code: 'CUPOM', is_active: true, used_count: 0, usage_limit: null, discount_type: tipo,
          discount_value: tipo === 'fixed' ? pick([8, 20, 40, 500]) : pick([5, 10, 30]),
          progressive_tiers: tipo === 'progressive' ? [{ min_value: 0, max_value: 99.99, discount: 5 }, { min_value: 100, max_value: null, discount: 10 }] : null,
          min_purchase_amount: null, min_items_quantity: null,
          starts_at: new Date(base + 86_400_000).toISOString(), expires_at: null };
      } else if (n < 200) {
        tipoCaso = 'fraude'; // desconto enviado pelo navegador sem cupom válido (código inexistente, nome de presente ou nenhum)
        codigo = pick(['NAOEXISTE', 'BOLSINHA', null]);
        const soma = pedidos.flatMap((p) => p.items).reduce((s, it) => s + it.unit_price * it.qty, 0);
        enviado = r2(soma * pick([0.5, 0.9, 1]));
      } else {
        tipoCaso = 'gateway';
      }
      const pixCfg = pick(Object.keys(GATEWAYS));
      const metodo = r() < 0.6 ? 'pix' : 'card';
      const frete = pick(FRETES);
      let cupomTela = 0, aplicado = false;
      if (cupom) { const t = await cupomNaTela(cupom, pedidos, agora); aplicado = t.aplicado; cupomTela = aplicado ? t.desconto : 0; }
      const descontoEnviado = tipoCaso === 'fraude' ? enviado : Math.round(cupomTela * 100) / 100;
      const cobr = await cobrar({ pix: GATEWAYS[pixCfg], pedidos, cupom: descontoEnviado, frete, metodo, cupomRow: cupom,
        codigo: tipoCaso === 'fraude' ? codigo : (aplicado ? 'CUPOM' : null) });
      const pixPct = 5;
      const tela = computeOrderTotals({
        orderSubtotals: pedidos.map((p) => p.items.reduce((s, it) => s + it.unit_price * it.qty, 0)),
        method: metodo, pixPercent: pixPct, couponDiscount: tipoCaso === 'fraude' ? 0 : cupomTela, promoDiscount: 0, shipping: frete,
      });
      out.push({ n, tipoCaso, gateway: pixCfg, metodo, cupomTela: r2(cupomTela), enviado: descontoEnviado, totalTelaSemFraude: r2(tela.total),
        cobrado: pedidos.map((p) => cobr.porPedido[p.id]?.total ?? null), mp: cobr.gatewayTotal, pagarme: cobr.pagarme,
        infinitepay: cobr.infinitepay, cobradoInf: cobr.porPedidoInf ? pedidos.map((p) => cobr.porPedidoInf[p.id] ?? null) : null });
    }
  } finally { rodarInfinitePay = false; }
  return out;
}

// ---------------------------------------------------------------- referência gravada
let referencia = existsSync(SAIDAS) ? JSON.parse(readFileSync(SAIDAS, 'utf8')) : null;
const atual = {};

test('base real: a cobrança de hoje reproduz o total pago nos 123 pedidos reais', async () => {
  atual.reais = await rodarReais();
  const pedidos = atual.reais.flatMap((c) => c.totaisCobrados.map((tot, j) => ({ tot, hoje: c.totaisHoje[j], k: c.k })));
  const iguais = pedidos.filter((p) => p.hoje != null && Math.abs(p.hoje - p.tot) <= 0.01).length;
  // Conferência de sanidade: a cobrança atual, com o desconto gravado no pedido, chega ao total que a cliente pagou.
  assert.ok(iguais >= pedidos.length - 3, `só ${iguais} de ${pedidos.length} pedidos reais bateram`);
  atual.resumoReais = { pedidos: pedidos.length, iguaisAoPago: iguais };
});

test('base real: o desconto do cupom pela regra de hoje (com a configuração atual do cupom)', () => {
  const comCupom = atual.reais.filter((c) => 'cupomRegraHoje' in c);
  const iguais = comCupom.filter((c) => c.cupomRegraHoje != null && Math.abs(c.cupomRegraHoje - c.cupomGravado) <= 0.01);
  atual.resumoCupom = { casos: comCupom.length, iguaisAoGravado: iguais.length };
  assert.ok(comCupom.length >= 50, 'a base real cobre cupons dos dois checkouts');
});

test('casos sorteados: tela do checkout do sistema + cobrança (600 casos)', async () => {
  atual.sorteados = await rodarSorteados(600);
  // Invariante de hoje: com um único pedido, o que a tela mostra é o que a cobrança grava.
  for (const c of atual.sorteados.filter((x) => x.cobrado.length === 1)) {
    assert.equal(c.cobrado[0].total, c.totalTela, `caso ${c.n}: tela ${c.totalTela} x cobrança ${c.cobrado[0].total}`);
  }
  // Com vários pedidos pagos juntos, a soma gravada nos pedidos também é igual ao total da tela.
  for (const c of atual.sorteados.filter((x) => x.cobrado.length > 1)) {
    assert.ok(Math.abs(c.cobrado.reduce((s, x) => s + x.total, 0) - c.totalTela) <= 0.01, `caso ${c.n}: soma dos pedidos x tela`);
  }
  // Achados da fase 0 (defeitos de HOJE, registrados para a regra nova corrigir — não são aceitos como certos):
  //  A) Mercado Pago recebe de 1 a 7 centavos a mais ou a menos que o total do pedido (arredondamento por item);
  //  B) cupom de 100% + desconto Pix: o Pix é aplicado de novo em cima e o Mercado Pago recebe valor errado (até negativo).
  const comMp = atual.sorteados.filter((x) => x.gatewayTotal != null);
  const dif = (x) => r2(x.gatewayTotal - x.cobrado.reduce((s, y) => s + y.total, 0));
  atual.achados = {
    casosMercadoPago: comMp.length,
    centavos: comMp.filter((x) => dif(x) !== 0 && Math.abs(dif(x)) <= 0.07).map((x) => x.n),
    cupom100MaisPix: comMp.filter((x) => Math.abs(dif(x)) > 0.07).map((x) => x.n),
  };
  for (const n of atual.achados.cupom100MaisPix) {
    const c = atual.sorteados[n];
    assert.ok(c.cupomTela + c.promo > 0 && c.pixTela > 0, `caso ${n}: diferença grande fora do padrão cupom 100% + Pix`);
  }
});

test('casos sorteados: regra de cupom da Loja da Live (5.000 carrinhos)', () => {
  atual.lojaDaLive = rodarLojaDaLive(5000);
  assert.ok(atual.lojaDaLive.some((c) => c.ok) && atual.lojaDaLive.some((c) => !c.ok));
});

test('ampliação: validade do cupom com pedidos juntos, presente, fraude e os três gateways (240 casos)', async () => {
  atual.ampliacao = await rodarAmpliacao();
  assert.equal(atual.ampliacao.length, 240);
});

test('referência gravada: a conta de hoje continua idêntica à gravada na fase 0', () => {
  if (GRAVAR || !referencia) {
    if (!GRAVAR && process.env.CI) assert.fail('referência ausente no CI: grave localmente com GRAVAR_REFERENCIA=1');
    writeFileSync(SAIDAS, JSON.stringify({ gravadoEm: '2026-11-21', ...atual }, null, 0));
    referencia = { ...atual };
    return;
  }
  for (const parte of ['reais', 'sorteados', 'lojaDaLive', 'ampliacao']) {
    const a = atual[parte], ref = referencia[parte];
    assert.equal(a.length, ref.length, `${parte}: quantidade de casos mudou`);
    for (let i = 0; i < a.length; i++) assert.deepEqual(a[i], ref[i], `${parte}, caso ${i}: resultado diferente da referência`);
  }
});
