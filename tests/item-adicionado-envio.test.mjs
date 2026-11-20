// Edge function zapi-send-item-added: respeita a decisão da pausa de 30 min antes de mandar WhatsApp.
// A decisão em si (send/deferred) é testada no Postgres em item-adicionado-pausa.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction, silenceLogs } from './support/edge.mjs';
import { extractFunctions } from './support/extract.mjs';

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

async function carregar(decisao, extraWhats, { mensagensAntigas = [], failReads } = {}) {
  const respostas = Array.isArray(decisao) ? [...decisao] : null;
  const tables = tabelas({ whatsapp: extraWhats });
  tables.whatsapp_messages.push(...mensagensAntigas);
  return loadEdgeFunction('zapi-send-item-added', {
    tables,
    failReads,
    rpc: {
      item_added_claim: () => {
        const d = respostas ? respostas.shift() : decisao;
        if (d instanceof Error) throw d;
        return d;
      },
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

const banco = () => new Error('banco fora do ar');
const recente = (minutos) => ({ tenant_id: LOJA, phone: '5531999887766', type: 'item_added', delivery_status: 'SENT', sent_at: new Date(Date.now() - minutos * 60_000).toISOString() });

test('banco lento: tenta a pausa de novo e respeita a resposta quando ela chega (P-02, corrigido)', async () => {
  const fn = await carregar([banco(), 'deferred']);
  await fn.call(pedido());
  assert.equal(mensagensWhatsApp(fn).length, 0, 'segunda tentativa disse "acumular": não manda');
  assert.equal(fn.sb.log.rpc.filter((r) => r.name === 'item_added_claim').length, 2);
});

test('banco sem resposta e cliente já recebeu mensagem há menos de 30 min: NÃO manda (P-02, corrigido)', async () => {
  const fn = await carregar(banco(), undefined, { mensagensAntigas: [recente(10)] });
  await fn.call(pedido());
  assert.equal(mensagensWhatsApp(fn).length, 0);
  assert.equal(fn.sb.log.rpc.filter((r) => r.name === 'item_added_claim').length, 3, 'tentou 3 vezes');
  assert.ok(fn.sb.db.whatsapp_messages.some((m) => m.delivery_status === 'SKIPPED'));
});

test('banco sem resposta e nenhuma mensagem nos últimos 30 min: manda normalmente', async () => {
  const fn = await carregar(banco(), undefined, { mensagensAntigas: [recente(45)] });
  await fn.call(pedido());
  assert.equal(mensagensWhatsApp(fn).length, 1);
});

test('banco totalmente fora (nem a conferência funciona): não manda, protege o chip', async () => {
  const fn = await carregar(banco(), undefined, { failReads: ['whatsapp_messages'] });
  await fn.call(pedido());
  assert.equal(mensagensWhatsApp(fn).length, 0);
});

test('anti-spam nunca coloca caractere invisível dentro de link, código, valor ou telefone (P-04, corrigido)', async () => {
  const { addMessageVariation } = await import('../supabase/functions/_shared/anti-block-delay.ts');
  const { addMessageVariation: daTela } = await import('../src/lib/whatsapp-anti-block.ts');
  const { addVariation: daCobranca } = extractFunctions('supabase/functions/cobranca-process/index.ts', ['invisibleCharPosition', 'addVariation'], { EMOJI_VARIATIONS: {} });
  const link = 'https://app.cartzy.com.br/loja-teste/checkout?p=5531999887766';
  const pedacos = [link, 'C210', 'R$ 89,90', '5531999887766'];
  const base = `Item adicionado ao pedido\n\nColar Aurora (C210)\nQtd: *1*\nValor: *R$ 89,90*\n\nFinalize seu pedido: ${link}\n\nWhats da loja: 5531999887766`;
  for (const [nome, variar] of [['servidor', (t) => addMessageVariation(t, false)], ['tela', daTela], ['cobrança', daCobranca]]) {
    let variadas = 0;
    for (let i = 0; i < 2000; i++) {
      const msg = variar(base);
      for (const p of pedacos) assert.ok(msg.includes(p), `${nome}: "${p}" alterado`);
      assert.ok(!/https?:\/\/\S*\u200B/.test(msg), `${nome}: invisível colado no link`);
      if (msg !== base) variadas++;
    }
    assert.ok(variadas > 600, `${nome}: a variação anti-spam continua acontecendo (${variadas} de 2000)`);
  }
});

// ---- P-03 (etapa 4.1): quem pode chamar a função. Modo observação primeiro, trava depois. ----
const CHAVE = 'chave-interna-teste';
async function carregarComTrava(enforce) {
  const tables = tabelas();
  return loadEdgeFunction('zapi-send-item-added', {
    tables,
    env: enforce ? { ITEM_ADDED_ENFORCE_AUTH: 'true' } : {},
    rpc: {
      item_added_claim: () => 'send',
      reserve_send_slot: () => new Date().toISOString(),
      internal_key_check: (args) => args.p_name === 'item_added' && args.p_key === CHAVE,
    },
    fetchHandler: async (call) => (call.url.includes('/functions/v1/push-dispatch') ? { status: 200, body: { sent: false } } : { status: 200, body: { id: 'msg-1' } }),
  });
}
const auditoria = (fn) => fn.sb.db.internal_call_audit || [];

test('P-03 observação: chamada SEM chave ainda manda a mensagem, mas fica registrada como "sem_chave"', async () => {
  const fn = await carregarComTrava(false);
  await fn.call(pedido());
  assert.equal(mensagensWhatsApp(fn).length, 1, 'nada muda para as lojas no modo observação');
  assert.deepEqual(auditoria(fn).map((a) => [a.caller, a.allowed]), [['sem_chave', true]]);
});

test('P-03 observação: gatilho do banco com a chave interna é identificado como "internal_key"', async () => {
  const fn = await carregarComTrava(false);
  await fn.call(pedido(), { headers: { 'x-cartzy-internal-key': CHAVE } });
  assert.equal(mensagensWhatsApp(fn).length, 1);
  assert.equal(auditoria(fn)[0].caller, 'internal_key');
});

test('P-03 trava ligada: sem chave ou com chave errada é recusada (401) e nada é enviado', async () => {
  for (const headers of [{}, { 'x-cartzy-internal-key': 'chute' }, { Authorization: 'Bearer anon-qualquer' }]) {
    const fn = await carregarComTrava(true);
    const r = await fn.call(pedido(), { headers });
    assert.equal(r.status, 401);
    assert.equal(mensagensWhatsApp(fn).length, 0);
    assert.deepEqual(auditoria(fn).map((a) => [a.caller, a.allowed]), [['sem_chave', false]]);
  }
});

test('P-03 trava ligada: gatilho do banco (chave interna) e funções do sistema (service role) continuam enviando', async () => {
  for (const [headers, caller] of [[{ 'x-cartzy-internal-key': CHAVE }, 'internal_key'], [{ Authorization: 'Bearer service-role-teste' }, 'service_role']]) {
    const fn = await carregarComTrava(true);
    await fn.call(pedido(), { headers });
    assert.equal(mensagensWhatsApp(fn).length, 1, `${caller} manda`);
    assert.equal(auditoria(fn)[0].caller, caller);
  }
});

// ---- Etapa 4.4: observação ampla — identifica quem chama só pelos cabeçalhos, sem validar e sem bloquear ----
import { describeCaller } from '../supabase/functions/_shared/internal-auth.ts';
const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
const req = (headers) => new Request('https://x.test/fn', { method: 'POST', headers });

test('4.4: quem chama é identificado só pelos cabeçalhos (usuário, chave pública, sistema, chave interna, nenhuma)', () => {
  assert.deepEqual(describeCaller(req({ Authorization: 'Bearer srv' }), 'srv'), { caller: 'service_role', userId: null });
  assert.deepEqual(describeCaller(req({ 'x-cartzy-internal-key': 'k' }), 'srv'), { caller: 'chave_interna', userId: null });
  assert.deepEqual(describeCaller(req({ Authorization: `Bearer ${jwt({ role: 'authenticated', sub: 'u-1' })}` }), 'srv'), { caller: 'usuario', userId: 'u-1' });
  assert.deepEqual(describeCaller(req({ Authorization: `Bearer ${jwt({ role: 'anon' })}` }), 'srv'), { caller: 'chave_publica', userId: null });
  assert.deepEqual(describeCaller(req({ apikey: 'qualquer' }), 'srv'), { caller: 'chave_publica', userId: null });
  assert.deepEqual(describeCaller(req({}), 'srv'), { caller: 'nenhuma', userId: null });
  assert.deepEqual(describeCaller(req({ Authorization: 'Bearer lixo.lixo.lixo' }), 'srv'), { caller: 'nenhuma', userId: null });
});
