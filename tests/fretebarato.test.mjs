// Run with Node 24+: node --test tests/fretebarato.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteEndpoint, buildQuotePayload, normalizeQuotes } from '../supabase/functions/_shared/fretebarato.ts';
import { handleFreteBaratoQuote } from '../supabase/functions/_shared/fretebarato-quote-handler.ts';
import { handleFreteBaratoSettings } from '../supabase/functions/_shared/fretebarato-settings-handler.ts';

const tenant = '12345678-1234-1234-1234-123456789abc';
const product = { id: 'sku1', quantity: 2, insurance_value: 36.9, weight: 0.0351, length: 12.2, width: 8, height: 2 };
const integration = { id: 'integration', access_token: 'secret-not-for-browser', client_id: '123', scope: 'cartzy', is_active: true };
function database(options = {}) {
  const filters = [], writes = [];
  return { filters, writes, rpc: async () => ({ data: true, error: null }), from(table) {
    const chain = { select() { return chain; }, eq(key, value) { filters.push([table, key, value]); return chain; },
      maybeSingle: async () => ({ data: table === 'tenants' ? { is_active: options.active !== false } : options.integration === undefined ? integration : options.integration, error: options.readError ?? null }),
      update(values) { writes.push(values); return chain; }, insert(values) { writes.push(values); return chain; },
      then(resolve) { resolve({ error: options.writeError ?? null }); } };
    return chain;
  } };
}
const request = (body) => new Request('https://local.test/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const quoteRequest = () => request({ tenant_id: tenant, to_postal_code: '01310-100', products: [product] });

test('preserves CEP zero, reais, quantities and rounds dimensions/weight upwards', () => {
  assert.deepEqual(buildQuotePayload('01310-100', [product]), { zipcode: '01310100', amount: 73.8, skus: [{ sku: 'sku1', price: 36.9, quantity: 2, length: 13, width: 8, height: 2, weight: 0.036 }] });
  for (const invalid of [[], [{ ...product, quantity: 0 }], [{ ...product, weight: -1 }], [{ ...product, insurance_value: 'invalid' }]]) assert.throws(() => buildQuotePayload('01310100', invalid));
  assert.throws(() => buildQuotePayload('123', [product]));
});
test('only fixed Frete Barato host and safe platform/customer paths are accepted', () => {
  assert.equal(quoteEndpoint('cartzy', '123'), 'https://admin.fretebarato.com/cartzy/price/v1/json/123');
  for (const platform of ['../other', 'https://evil.test', 'a/b', '']) assert.throws(() => quoteEndpoint(platform, '123'));
  assert.throws(() => quoteEndpoint('cartzy', '123/secret'));
});
test('normalizes services, preserves free shipping and rejects invalid/duplicate options', () => {
  const options = normalizeQuotes({ quotes: [
    { quote_id: 1, name: 'GFL', service: 'Expresso', price: 21.16, days: 2 },
    { quote_id: 2, name: 'GFL', service: 'GFL', price: 0, days: 0 },
    { quote_id: 1, name: 'GFL', service: 'dup', price: 1, days: 1 },
    { quote_id: 3, name: 'Bad', service: 'Bad', price: -1, days: 2 },
    { quote_id: 4, name: 'Bad', service: 'Bad', price: null, days: 2 },
    { quote_id: 5, name: 'Bad', service: 'Bad', price: 2, days: -1 },
  ] });
  assert.equal(options.length, 2); assert.equal(options[0].name, 'GFL · Expresso');
  assert.equal(options[0].delivery_time, '2 dias úteis'); assert.equal(options[1].price, 0);
  assert.throws(() => normalizeQuotes({ unexpected: [] }));
});
test('quote selects the requested tenant/provider, sends Bearer only upstream and returns normalized options', async () => {
  const db = database(); let calls = 0;
  const response = await handleFreteBaratoQuote(quoteRequest(), db, async (url, init) => {
    calls++; assert.equal(url, quoteEndpoint('cartzy', '123'));
    assert.equal(init.headers.Authorization, `Bearer ${integration.access_token}`);
    assert.equal(JSON.parse(init.body).amount, 73.8);
    return Response.json({ quotes: [{ quote_id: 1, name: 'GFL', service: 'GFL', price: 21.16, days: 2 }] });
  });
  const text = await response.text(); assert.equal(calls, 1); assert.equal(JSON.parse(text).shipping_options[0].price, 21.16);
  assert.ok(db.filters.some(([t, k, v]) => t === 'shipping_integrations' && k === 'tenant_id' && v === tenant));
  assert.ok(db.filters.some(([t, k, v]) => t === 'shipping_integrations' && k === 'provider' && v === 'fretebarato'));
  assert.ok(db.filters.some(([t, k, v]) => t === 'shipping_integrations' && k === 'is_active' && v === true));
  assert.equal(text.includes(integration.access_token), false);
});
test('invalid, inactive, unconfigured or rate-limited requests never call the provider', async () => {
  const never = async () => { throw new Error('provider must not be called'); };
  for (const db of [database({ active: false }), database({ integration: null }), database({ readError: { message: 'offline' } })]) {
    assert.equal((await (await handleFreteBaratoQuote(quoteRequest(), db, never)).json()).success, false);
  }
  const db = database(); db.rpc = async () => ({ data: false, error: null });
  assert.equal((await handleFreteBaratoQuote(quoteRequest(), db, never)).status, 429);
  assert.equal((await handleFreteBaratoQuote(request({ tenant_id: tenant, products: [] }), database(), never)).status, 200);
});
test('upstream auth errors, malformed responses and timeouts do not leak credentials or responses', async () => {
  for (const fetcher of [async () => new Response(integration.access_token, { status: 401 }), async () => Response.json({ bad: integration.access_token }), async () => { throw new Error(integration.access_token); }]) {
    const response = await handleFreteBaratoQuote(quoteRequest(), database(), fetcher);
    const text = await response.text(); assert.equal(JSON.parse(text).success, false); assert.equal(text.includes(integration.access_token), false);
  }
});
const allowed = async () => ({ ok: true, mode: 'user' });
test('settings rejects unauthorized callers before reading or writing tenant credentials', async () => {
  const db = database();
  const response = await handleFreteBaratoSettings(request({ action: 'get', tenant_id: tenant }), db, async () => ({ ok: false, status: 403, error: 'Nao autorizado' }));
  assert.equal(response.status, 403); assert.equal(db.filters.length, 0); assert.equal(db.writes.length, 0);
});
test('settings never returns saved token and preserves it when saving blank replacement', async () => {
  const db = database();
  const response = await handleFreteBaratoSettings(request({ action: 'get', tenant_id: tenant }), db, allowed);
  const text = await response.text(); assert.equal(JSON.parse(text).hasToken, true); assert.equal(text.includes(integration.access_token), false);
  const saved = await handleFreteBaratoSettings(request({ action: 'save', tenant_id: tenant, customerId: '123', platform: 'cartzy', token: '' }), db, allowed);
  assert.equal((await saved.json()).success, true); assert.equal(db.writes[0].access_token, integration.access_token);
});
test('new settings stay inactive and activation respects the existing two-provider constraint', async () => {
  const fresh = database({ integration: null });
  assert.equal((await (await handleFreteBaratoSettings(request({ action: 'save', tenant_id: tenant, customerId: '123', platform: 'cartzy', token: 'new-secret' }), fresh, allowed)).json()).success, true);
  assert.equal(fresh.writes[0].is_active, false);
  const limited = database({ writeError: { code: '23514' } });
  const response = await handleFreteBaratoSettings(request({ action: 'toggle', tenant_id: tenant, isActive: true }), limited, allowed);
  assert.equal(response.status, 400); assert.match((await response.json()).error, /duas integrações/);
});
