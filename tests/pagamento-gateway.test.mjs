// Pagamento: cada loja só cobra pelo próprio gateway, e sem gateway aparece o erro combinado.
// Roda a edge function create-payment de verdade, com banco falso e chamadas externas gravadas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction, silenceLogs } from './support/edge.mjs';
import { getActiveTenantMpToken, MISSING_PAYMENT_PROVIDER_ERROR } from '../supabase/functions/_shared/tenant-mp-token.ts';
import { applyPaymentMethodLock, normalizePaymentMethodChoice, buildLockedCheckoutUrl } from '../supabase/functions/_shared/payment-method-lock.ts';
import { resolvePixDiscount } from '../supabase/functions/_shared/pix-discount.ts';
import { createFakeSupabase } from './support/fake-supabase.mjs';

const LOJA_A = '11111111-1111-4111-8111-111111111111';
const LOJA_B = '22222222-2222-4222-8222-222222222222';
let restore;
before(() => { restore = silenceLogs(); });
after(() => restore());

const pedido = (tenant, extra = {}) => ({
  tenant_id: tenant,
  order_id: 501,
  cartItems: [{ product_name: 'Brinco Lunna', product_code: 'C101', qty: 2, unit_price: 50 }],
  customerData: { name: 'Maria Teste', phone: '31999990000', cpf: '52998224725', email: 'maria@teste.com' },
  addressData: { cep: '30110000', street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Belo Horizonte', state: 'MG' },
  shippingCost: 20,
  total: '120',
  ...extra,
});

function tabelas(integracoes = {}) {
  return {
    orders: [{ id: 501, tenant_id: LOJA_A, cart_id: 9, total_amount: 120, observation: '', created_at: new Date().toISOString() }],
    customers: [], cart_items: [], tenants: [{ id: LOJA_A }, { id: LOJA_B }],
    integration_mp: integracoes.mp ?? [], integration_pagarme: integracoes.pagarme ?? [],
    integration_appmax: integracoes.appmax ?? [], integration_infinitepay: integracoes.infinitepay ?? [],
  };
}

const mpAtivo = (tenant, token, extra = {}) => ({ tenant_id: tenant, is_active: true, access_token: token, environment: 'production', enable_pix: true, enable_credit_card: true, ...extra });
const respondeGateways = async (call) => {
  if (call.url.includes('mercadopago.com/checkout/preferences')) return { status: 201, body: { id: 'pref-1', init_point: 'https://mp.test/checkout/pref-1' } };
  if (call.url.includes('mercadopago.com/v1/payment_methods')) return { status: 200, body: [{ id: 'pix', payment_type_id: 'bank_transfer', status: 'active' }] };
  if (call.url.includes('pagar.me')) return { status: 200, body: { id: 'pl_1', url: 'https://pagar.me/link/pl_1' } };
  return { status: 200, body: {} };
};

test('loja sem nenhum gateway recebe "Não há sistema de pagamento cadastrado." e nada é chamado fora', async () => {
  const fn = await loadEdgeFunction('create-payment', { tables: tabelas(), fetchHandler: respondeGateways });
  const res = await fn.call(pedido(LOJA_A));
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Não há sistema de pagamento cadastrado.');
  assert.equal(MISSING_PAYMENT_PROVIDER_ERROR, 'Não há sistema de pagamento cadastrado.');
  assert.equal(fn.calls.length, 0, 'nenhuma chamada a gateway externo');
});

test('loja sem gateway NÃO usa o token de Mercado Pago da plataforma, mesmo que ele exista no servidor', async () => {
  const fn = await loadEdgeFunction('create-payment', {
    tables: tabelas(),
    env: { MP_ACCESS_TOKEN: 'TOKEN-DA-PLATAFORMA', MERCADO_PAGO_ACCESS_TOKEN: 'TOKEN-DA-PLATAFORMA' },
    fetchHandler: respondeGateways,
  });
  const res = await fn.call(pedido(LOJA_A));
  assert.equal(res.body.error, 'Não há sistema de pagamento cadastrado.');
  assert.ok(!fn.calls.some((c) => JSON.stringify(c.headers).includes('TOKEN-DA-PLATAFORMA')));
});

test('loja com Mercado Pago desativado também recebe o erro, sem cair em outro token', async () => {
  const fn = await loadEdgeFunction('create-payment', {
    tables: tabelas({ mp: [mpAtivo(LOJA_A, 'TOKEN-LOJA-A', { is_active: false })] }),
    fetchHandler: respondeGateways,
  });
  const res = await fn.call(pedido(LOJA_A));
  assert.equal(res.body.error, 'Não há sistema de pagamento cadastrado.');
  assert.equal(fn.calls.length, 0);
});

test('cada loja cobra com o próprio token do Mercado Pago, nunca com o de outra loja', async () => {
  const tables = tabelas({ mp: [mpAtivo(LOJA_A, 'TOKEN-LOJA-A'), mpAtivo(LOJA_B, 'TOKEN-LOJA-B')] });
  tables.orders.push({ id: 502, tenant_id: LOJA_B, cart_id: 10, total_amount: 120, observation: '', created_at: new Date().toISOString() });
  const fn = await loadEdgeFunction('create-payment', { tables, fetchHandler: respondeGateways });

  await fn.call(pedido(LOJA_B, { order_id: 502 }));
  const pref = fn.calls.find((c) => c.url.includes('/checkout/preferences'));
  assert.ok(pref, 'gerou a preferência no Mercado Pago');
  assert.match(pref.headers.Authorization ?? pref.headers.authorization, /TOKEN-LOJA-B/);
  assert.ok(!fn.calls.some((c) => JSON.stringify(c.headers).includes('TOKEN-LOJA-A')));
  assert.match(pref.body.external_reference, new RegExp(`tenant:${LOJA_B}`));
});

test('ordem de escolha do gateway: InfinitePay, depois App Max, depois Pagar.me, depois Mercado Pago', async () => {
  const todos = {
    mp: [mpAtivo(LOJA_A, 'TOKEN-MP')],
    pagarme: [{ tenant_id: LOJA_A, is_active: true, api_key: 'sk_teste', enable_pix: true, enable_credit_card: true }],
    infinitepay: [{ tenant_id: LOJA_A, is_active: true, handle: 'lojaa', enable_pix: true, enable_credit_card: true }],
  };
  const comInfinite = await loadEdgeFunction('create-payment', { tables: tabelas(todos), fetchHandler: respondeGateways });
  await comInfinite.call(pedido(LOJA_A));
  assert.deepEqual(comInfinite.sb.log.invokes.map((i) => i.name), ['create-infinitepay-payment']);
  assert.equal(comInfinite.calls.length, 0, 'InfinitePay é delegada; Mercado Pago e Pagar.me não são chamados');

  const semInfinite = await loadEdgeFunction('create-payment', { tables: tabelas({ ...todos, infinitepay: [] }), fetchHandler: respondeGateways });
  await semInfinite.call(pedido(LOJA_A));
  assert.ok(semInfinite.calls.some((c) => c.url.includes('pagar.me')), 'Pagar.me vem antes do Mercado Pago');
  assert.ok(!semInfinite.calls.some((c) => c.url.includes('mercadopago')));
});

test('desconto do Pix é recalculado no servidor: valor enviado pela tela é ignorado', async () => {
  const fn = await loadEdgeFunction('create-payment', {
    tables: tabelas({ mp: [mpAtivo(LOJA_A, 'TOKEN-LOJA-A', { pix_discount_percent: 5 })] }),
    fetchHandler: respondeGateways,
  });
  await fn.call(pedido(LOJA_A, { payment_method: 'pix', pix_discount: 999 }));
  const pref = fn.calls.find((c) => c.url.includes('/checkout/preferences'));
  assert.ok(pref);
  const produto = pref.body.items.find((i) => i.title === 'Brinco Lunna');
  const frete = pref.body.items.find((i) => i.title === 'Frete');
  assert.equal(produto.unit_price, 47.5, '5% de Pix só sobre os produtos (R$ 50 → R$ 47,50)');
  assert.equal(frete.unit_price, 20, 'frete não recebe desconto do Pix');
  const totalCobrado = pref.body.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  assert.equal(totalCobrado, 115, 'o desconto falso de R$ 999 enviado pela tela foi ignorado');
});

test('quem escolheu Pix no checkout só consegue pagar com Pix no Mercado Pago', async () => {
  const fn = await loadEdgeFunction('create-payment', { tables: tabelas({ mp: [mpAtivo(LOJA_A, 'TOKEN-LOJA-A')] }), fetchHandler: respondeGateways });
  await fn.call(pedido(LOJA_A, { payment_method: 'pix' }));
  const pref = fn.calls.find((c) => c.url.includes('/checkout/preferences'));
  const bloqueados = pref.body.payment_methods.excluded_payment_types.map((t) => t.id);
  assert.ok(bloqueados.includes('credit_card') && bloqueados.includes('debit_card'));
});

test('token do Mercado Pago: só vale se a integração da loja estiver ativa', () => {
  assert.equal(getActiveTenantMpToken(null), null);
  assert.equal(getActiveTenantMpToken({ is_active: false, access_token: 'x' }), null);
  assert.equal(getActiveTenantMpToken({ is_active: true, access_token: '  ' }), null);
  assert.equal(getActiveTenantMpToken({ is_active: true, access_token: ' tok ' }), 'tok');
});

test('trava do método de pagamento em cada gateway', () => {
  assert.equal(normalizePaymentMethodChoice('Cartão'), 'card');
  assert.equal(normalizePaymentMethodChoice('credit_card'), 'card');
  assert.equal(normalizePaymentMethodChoice('PIX'), 'pix');
  assert.equal(normalizePaymentMethodChoice('boleto'), null);

  const semEscolha = {};
  applyPaymentMethodLock('mercado_pago', semEscolha, null);
  assert.deepEqual(semEscolha, {}, 'sem escolha, o gateway mostra todos os métodos');

  const cartaoMp = {};
  applyPaymentMethodLock('mercado_pago', cartaoMp, 'card');
  assert.ok(!cartaoMp.payment_methods.excluded_payment_types.some((t) => t.id === 'credit_card'));

  assert.equal(buildLockedCheckoutUrl('https://checkout.infinitepay.io/loja?x=1', 'pix'), 'https://checkout.infinitepay.io/loja?x=1&payment_method=pix');
  assert.equal(buildLockedCheckoutUrl('https://checkout.infinitepay.io/loja', 'cartão'), 'https://checkout.infinitepay.io/loja?payment_method=credit_card');
  assert.equal(buildLockedCheckoutUrl('https://checkout.infinitepay.io/loja', null), 'https://checkout.infinitepay.io/loja');
});

test('Pix escolhido mas conta Mercado Pago da loja sem Pix ativo: bloqueia em vez de deixar pagar com cartão e desconto', async () => {
  const fn = await loadEdgeFunction('create-payment', {
    tables: tabelas({ mp: [mpAtivo(LOJA_A, 'TOKEN-LOJA-A')] }),
    fetchHandler: async (call) => (call.url.includes('payment_methods') ? { status: 200, body: [{ id: 'visa', status: 'active' }] } : respondeGateways(call)),
  });
  const res = await fn.call(pedido(LOJA_A, { payment_method: 'pix' }));
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /PIX não está habilitado/);
  assert.ok(!fn.calls.some((c) => c.url.includes('/checkout/preferences')));
});

test('desconto do Pix: prioridade App Max > Pagar.me > Mercado Pago > InfinitePay, só no Pix', async () => {
  const sb = createFakeSupabase({ tables: {
    integration_appmax: [], integration_pagarme: [{ tenant_id: LOJA_A, is_active: true, pix_discount_percent: 3 }],
    integration_mp: [{ tenant_id: LOJA_A, is_active: true, pix_discount_percent: 10 }], integration_infinitepay: [],
  } });
  assert.deepEqual(await resolvePixDiscount(sb, LOJA_A, 'pix', 200), { percent: 3, value: 6, source: 'pagarme' });
  assert.deepEqual(await resolvePixDiscount(sb, LOJA_A, 'card', 200), { percent: 0, value: 0, source: null });
  assert.deepEqual(await resolvePixDiscount(sb, LOJA_B, 'pix', 200), { percent: 0, value: 0, source: null });
});

test('desconto do Pix deveria vir do mesmo gateway que cobra (ver docs/refatoracao/decisoes.md, P-01)', { todo: 'divergência atual: a cobrança prioriza InfinitePay, o desconto prioriza App Max' }, async () => {
  const sb = createFakeSupabase({ tables: {
    integration_appmax: [{ tenant_id: LOJA_A, is_active: true, pix_discount_percent: 10 }], integration_pagarme: [], integration_mp: [],
    integration_infinitepay: [{ tenant_id: LOJA_A, is_active: true, pix_discount_percent: 0 }],
  } });
  const r = await resolvePixDiscount(sb, LOJA_A, 'pix', 100);
  assert.equal(r.source, 'infinitepay');
});
