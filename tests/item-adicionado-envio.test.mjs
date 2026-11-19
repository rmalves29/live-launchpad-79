// Edge function zapi-send-item-added: respeita a decisão da pausa de 30 min antes de mandar WhatsApp.
// A decisão em si (send/deferred) é testada no Postgres em item-adicionado-pausa.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction, silenceLogs } from './support/edge.mjs';

const LOJA = '33333333-3333-4333-8333-333333333333';
let restore;
before(() => { restore = silenceLogs(); });
after(() => restore());

function tabelas(extra = {}) {
  return {
    tenants: [{ id: LOJA, slug: 'loja-teste' }],
    integration_whatsapp: [{ tenant_id: LOJA, is_active: true, provider: 'uazapi', uazapi_url: 'https://uaz.test', uazapi_token: 'tok-loja', send_item_added_msg: true, item_added_button_enabled: false, ...extra.whatsapp }],
    whatsapp_templates: [], whatsapp_messages: [], orders: [{ id: 77, tenant_id: LOJA, cart_id: 5 }], cart_items: [], app_settings: [], customers: [],
  };
}

const pedido = (extra = {}) => ({ tenant_id: LOJA, customer_phone: '31999887766', product_name: 'Colar Aurora', product_code: 'C210', quantity: 1, unit_price: 89.9, order_id: 77, ...extra });
const mensagensWhatsApp = (fn) => fn.calls.filter((c) => c.url.startsWith('https://uaz.test/send/'));
// O envio insere caracteres invisíveis em posições sorteadas (anti-spam); tiramos antes de comparar o texto.
const texto = (call) => String(call.body.text ?? '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');

async function carregar(decisao, extraWhats) {
  return loadEdgeFunction('zapi-send-item-added', {
    tables: tabelas({ whatsapp: extraWhats }),
    rpc: {
      item_added_claim: () => { if (decisao instanceof Error) throw decisao; return decisao; },
      reserve_send_slot: () => new Date().toISOString(),
    },
    fetchHandler: async (call) => (call.url.includes('/functions/v1/push-dispatch') ? { status: 200, body: { sent: false } } : { status: 200, body: { id: 'msg-1', messageid: 'msg-1' } }),
  });
}

test('decisão "send": manda o WhatsApp do item adicionado pela instância da própria loja', async () => {
  const fn = await carregar('send');
  await fn.call(pedido());
  const enviadas = mensagensWhatsApp(fn);
  assert.equal(enviadas.length, 1);
  assert.equal(enviadas[0].headers.token, 'tok-loja');
  assert.equal(enviadas[0].body.number, '5531999887766');
  assert.match(texto(enviadas[0]), /Colar Aurora/);
  assert.ok(fn.sb.log.rpc.some((r) => r.name === 'item_added_claim' && r.args.p_cooldown_minutes === 30), 'pausa de 30 minutos pedida ao banco');
});

test('decisão "deferred": NÃO manda WhatsApp e registra o item como acumulado', async () => {
  const fn = await carregar('deferred');
  await fn.call(pedido());
  assert.equal(mensagensWhatsApp(fn).length, 0);
  const log = fn.sb.db.whatsapp_messages.find((m) => m.delivery_status === 'DEFERRED');
  assert.ok(log, 'registro do item acumulado');
});

test('mensagem acumulada (fim da pausa) sai uma vez só com todos os itens, sem pedir nova pausa', async () => {
  const fn = await carregar('deferred');
  await fn.call(pedido({ flush: true, consolidated_items: [
    { product_name: 'Colar Aurora', product_code: 'C210', quantity: 1, unit_price: 89.9 },
    { product_name: 'Brinco Lua', product_code: 'C211', quantity: 2, unit_price: 39.9 },
  ] }));
  const enviadas = mensagensWhatsApp(fn);
  assert.equal(enviadas.length, 1);
  assert.match(texto(enviadas[0]), /Colar Aurora/);
  assert.match(texto(enviadas[0]), /Brinco Lua/);
  assert.ok(!fn.sb.log.rpc.some((r) => r.name === 'item_added_claim'));
});

test('mensagem acumulada é descartada se o pedido já foi pago durante a pausa', async () => {
  const fn = await carregar('send');
  fn.sb.db.orders[0].is_paid = true;
  await fn.call(pedido({ flush: true, consolidated_items: [{ product_name: 'Colar Aurora', product_code: 'C210', quantity: 1, unit_price: 89.9 }] }));
  assert.equal(mensagensWhatsApp(fn).length, 0);
  assert.ok(fn.sb.db.whatsapp_messages.some((m) => m.delivery_status === 'SKIPPED'));
});

test('loja com "mensagem de item adicionado" desligada não manda nada', async () => {
  const fn = await carregar('send', { send_item_added_msg: false });
  await fn.call(pedido());
  assert.equal(mensagensWhatsApp(fn).length, 0);
});

test('telefone inválido é recusado sem mandar mensagem', async () => {
  const fn = await carregar('send');
  const res = await fn.call(pedido({ customer_phone: '123' }));
  assert.equal(res.status, 400);
  assert.equal(mensagensWhatsApp(fn).length, 0);
});

test('se o banco não responder a pausa, hoje a mensagem sai mesmo assim (ver docs/refatoracao/decisoes.md, P-02)', async () => {
  const fn = await carregar(new Error('banco fora do ar'));
  await fn.call(pedido());
  assert.equal(mensagensWhatsApp(fn).length, 1, 'comportamento atual registrado: envia sem pausa');
});

test('link do checkout nunca recebe caractere invisível no meio (ver docs/refatoracao/decisoes.md, P-04)', { todo: 'hoje o caractere anti-spam cai em posição sorteada, inclusive dentro do link' }, async () => {
  const { addMessageVariation } = await import('../supabase/functions/_shared/anti-block-delay.ts');
  const link = 'https://app.cartzy.com.br/loja-teste/checkout?p=5531999887766';
  const base = `Item adicionado ao pedido\n\nColar Aurora (C210)\nQtd: *1*\nValor: *R$ 89,90*\n\nFinalize seu pedido: ${link}\n\nQualquer duvida, estou a disposicao!`;
  let quebrados = 0;
  for (let i = 0; i < 2000; i++) if (!addMessageVariation(base, false).includes(link)) quebrados++;
  assert.equal(quebrados, 0, `${quebrados} de 2000 mensagens saíram com o link alterado`);
});
