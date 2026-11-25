// Fase 1 (21/11/2026): a cobrança decide o desconto no servidor. Roda as edge functions de verdade, com banco falso.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction, silenceLogs } from './support/edge.mjs';

const LOJA = '11111111-1111-4111-8111-111111111111';
let restore;
before(() => { restore = silenceLogs(); });
after(() => restore());

const gateways = async (call) => {
  if (call.url.includes('mercadopago.com/checkout/preferences')) return { status: 201, body: { id: 'pref-1', init_point: 'https://mp.test/p' } };
  if (call.url.includes('mercadopago.com/v1/payment_methods')) return { status: 200, body: [{ id: 'pix', payment_type_id: 'bank_transfer', status: 'active' }] };
  if (call.url.includes('infinitepay.io')) return { status: 200, body: { url: 'https://inf.test/l' } };
  return { status: 200, body: {} };
};

function banco({ pedido = {}, cupons = [], promocoes = [], mp = { pix_discount_percent: 0 }, infinitepay = null } = {}) {
  return {
    orders: [{ id: 501, tenant_id: LOJA, cart_id: 9, total_amount: 0, observation: '', created_at: '2026-11-20T12:00:00Z', source: 'whatsapp', coupon_code: null, coupon_discount: null, ...pedido }],
    cart_items: [
      { id: 1, cart_id: 9, product_id: 71, qty: 2, unit_price: 50, product_name: 'Brinco Lunna', product_code: 'C101' },
      { id: 2, cart_id: 9, product_id: 72, qty: 1, unit_price: 30, product_name: 'Anel Sol', product_code: 'C102' },
    ],
    products: [{ id: 71, category_id: 'cat-a' }, { id: 72, category_id: 'cat-a' }],
    coupons: cupons.map((c) => ({ tenant_id: LOJA, is_active: true, channel: 'bazar', used_count: 0, usage_limit: null, starts_at: null, expires_at: null, min_purchase_amount: null, min_items_quantity: null, progressive_tiers: null, ...c })),
    product_promotions: promocoes.map((p, i) => ({ id: i + 1, tenant_id: LOJA, is_active: true, starts_at: null, ends_at: null, ...p })),
    customers: [], tenants: [{ id: LOJA }],
    integration_mp: mp ? [{ tenant_id: LOJA, is_active: true, access_token: 'TOKEN', environment: 'production', enable_pix: true, enable_credit_card: true, ...mp }] : [],
    integration_pagarme: [], integration_appmax: [],
    integration_infinitepay: infinitepay ? [{ tenant_id: LOJA, is_active: true, handle: 'loja', enable_pix: true, enable_credit_card: true, pix_discount_percent: 0, ...infinitepay }] : [],
  };
}

const pagamento = (extra = {}) => ({
  tenant_id: LOJA, order_id: 501, order_ids: [501],
  cartItems: [{ product_name: 'Brinco Lunna', product_code: 'C101', qty: 2, unit_price: 50 }, { product_name: 'Anel Sol', product_code: 'C102', qty: 1, unit_price: 30 }],
  customerData: { name: 'Maria Teste', phone: '31999990000', cpf: '52998224725', email: 'maria@teste.com' },
  addressData: { cep: '30110000', street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'BH', state: 'MG' },
  shippingCost: 20, total: '150', payment_method: 'card', ...extra,
});

const totalGravado = (fn) => fn.sb.log.writes.filter((w) => w.table === 'orders' && w.action === 'update' && w.values.total_amount != null).at(-1)?.values;
const totalMp = (fn) => { const p = fn.calls.find((c) => c.url.includes('/checkout/preferences')); return Math.round(p.body.items.reduce((s, i) => s + i.unit_price * i.quantity, 0) * 100) / 100; };

test('desconto mandado pelo navegador SEM cupom é ignorado: cobra o valor cheio (R$ 130 + R$ 20 de frete)', async () => {
  const fn = await loadEdgeFunction('create-payment', { tables: banco(), fetchHandler: gateways });
  await fn.call(pagamento({ coupon_discount: 120, coupon_code: null }));
  assert.equal(totalGravado(fn).total_amount, 150);
  assert.equal(totalGravado(fn).coupon_discount, 0);
  assert.equal(totalMp(fn), 150);
});

test('código de cupom que não existe (ou nome de presente) não dá desconto, mesmo mandando valor', async () => {
  for (const codigo of ['NAOEXISTE', 'BOLSINHA DE PRESENTE']) {
    const fn = await loadEdgeFunction('create-payment', { tables: banco(), fetchHandler: gateways });
    await fn.call(pagamento({ coupon_discount: 130, coupon_code: codigo }));
    assert.equal(totalGravado(fn).total_amount, 150, codigo);
  }
});

test('cupom válido: o servidor calcula o desconto, não importa o valor mandado (10% de R$ 130 = R$ 13)', async () => {
  const fn = await loadEdgeFunction('create-payment', { tables: banco({ cupons: [{ code: 'DEZ', discount_type: 'percentage', discount_value: 10 }] }), fetchHandler: gateways });
  await fn.call(pagamento({ coupon_discount: 130, coupon_code: 'DEZ' }));
  assert.equal(totalGravado(fn).total_amount, 137);
  assert.equal(totalGravado(fn).coupon_discount, 13);
  assert.equal(totalGravado(fn).coupon_code, 'DEZ');
  assert.equal(totalMp(fn), 137);
});

test('cupom do canal Loja da Live não vale no checkout do sistema', async () => {
  const fn = await loadEdgeFunction('create-payment', { tables: banco({ cupons: [{ code: 'LIVE10', discount_type: 'percentage', discount_value: 10, channel: 'live' }] }), fetchHandler: gateways });
  await fn.call(pagamento({ coupon_discount: 13, coupon_code: 'LIVE10' }));
  assert.equal(totalGravado(fn).total_amount, 150);
});

test('limite de uso: a tela soma o uso antes de pagar, então o último uso permitido ainda vale; passou do limite, não vale', async () => {
  const cupom = (usados) => [{ code: 'DEZ', discount_type: 'percentage', discount_value: 10, usage_limit: 5, used_count: usados }];
  const ultimo = await loadEdgeFunction('create-payment', { tables: banco({ cupons: cupom(5) }), fetchHandler: gateways });
  await ultimo.call(pagamento({ coupon_code: 'DEZ' }));
  assert.equal(totalGravado(ultimo).total_amount, 137);
  const passou = await loadEdgeFunction('create-payment', { tables: banco({ cupons: cupom(6) }), fetchHandler: gateways });
  await passou.call(pagamento({ coupon_code: 'DEZ' }));
  assert.equal(totalGravado(passou).total_amount, 150);
});

test('promoção "leve 3 pague 2" é calculada no servidor com a categoria do produto (peça mais barata grátis: R$ 30)', async () => {
  const promocoes = [{ name: 'Leve 3 pague 2', category_id: 'cat-a', promotion_type: 'bogo', buy_qty: 2, get_qty: 1, discount_percent: 100 }];
  const fn = await loadEdgeFunction('create-payment', { tables: banco({ promocoes }), fetchHandler: gateways });
  await fn.call(pagamento({ coupon_discount: 0, coupon_code: null }));
  assert.equal(totalGravado(fn).total_amount, 120);
  assert.equal(totalGravado(fn).coupon_code, 'BOGO');
});

test('pedido da Loja da Live: vale o desconto que o servidor da Loja da Live gravou no pedido, não o mandado', async () => {
  const fn = await loadEdgeFunction('create-payment', { tables: banco({ pedido: { source: 'live_shop', coupon_code: 'LIVE5', coupon_discount: 6.5 } }), fetchHandler: gateways });
  await fn.call(pagamento({ coupon_discount: 100, coupon_code: 'LIVE5' }));
  assert.equal(totalGravado(fn).total_amount, 143.5);
  assert.equal(totalGravado(fn).coupon_code, 'LIVE5');
});

test('cupom de 100% + Pix no Mercado Pago: cobra só o frete, nada negativo (antes ia valor errado)', async () => {
  const tables = banco({ cupons: [{ code: 'VALE', discount_type: 'fixed', discount_value: 500 }], mp: { pix_discount_percent: 10 } });
  const fn = await loadEdgeFunction('create-payment', { tables, fetchHandler: gateways });
  await fn.call(pagamento({ coupon_code: 'VALE', payment_method: 'pix' }));
  assert.equal(totalGravado(fn).total_amount, 20);
  const pref = fn.calls.find((c) => c.url.includes('/checkout/preferences'));
  assert.ok(pref.body.items.every((i) => i.unit_price > 0), 'nenhum item com preço zero ou negativo');
  assert.equal(totalMp(fn), 20);
});

test('Mercado Pago recebe exatamente o total do pedido (antes podia sobrar ou faltar centavo)', async () => {
  const tables = banco({ cupons: [{ code: 'SETE', discount_type: 'percentage', discount_value: 7 }], mp: { pix_discount_percent: 5 } });
  tables.cart_items = [
    { id: 1, cart_id: 9, product_id: 71, qty: 3, unit_price: 19.9, product_name: 'A', product_code: 'A' },
    { id: 2, cart_id: 9, product_id: 72, qty: 2, unit_price: 11.11, product_name: 'B', product_code: 'B' },
  ];
  const fn = await loadEdgeFunction('create-payment', { tables, fetchHandler: gateways });
  await fn.call(pagamento({ coupon_code: 'SETE', payment_method: 'pix', shippingCost: 13.9 }));
  assert.equal(totalMp(fn), Math.round(totalGravado(fn).total_amount * 100) / 100);
});

test('InfinitePay chamada DIRETO pela internet com desconto falso: o desconto é ignorado', async () => {
  const fn = await loadEdgeFunction('create-infinitepay-payment', { tables: banco({ mp: null, infinitepay: {} }), fetchHandler: gateways });
  await fn.call(pagamento({ coupon_discount: 129, coupon_code: 'NAOEXISTE', pix_discount: 0 }));
  assert.equal(totalGravado(fn).total_amount, 150);
  const link = fn.calls.find((c) => c.url.includes('infinitepay.io/links'));
  assert.equal(link.body.items.reduce((s, i) => s + i.price * i.quantity, 0), 15000);
});
