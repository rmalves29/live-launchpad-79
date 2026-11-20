// Etapa 4.2: o atendimento do WhatsApp (zapi-webhook) foi dividido em partes. Este teste roda a versão ANTIGA
// (cópia guardada em tests/fixtures/zapi-webhook-antes.ts.txt) e a NOVA com os mesmos eventos e compara tudo o que
// cada uma grava no banco, chama e responde. A única diferença esperada é a correção do aviso de produto esgotado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEdgeFunction, silenceLogs } from './support/edge.mjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const DIR_ANTIGO = path.join(ROOT, 'supabase/functions/__zapi_webhook_antes');
const LOJA = '44444444-4444-4444-8444-444444444444';
let restore;
before(() => {
  restore = silenceLogs();
  mkdirSync(DIR_ANTIGO, { recursive: true });
  copyFileSync(path.join(ROOT, 'tests/fixtures/zapi-webhook-antes.ts.txt'), path.join(DIR_ANTIGO, 'index.ts'));
});
after(() => { restore(); rmSync(DIR_ANTIGO, { recursive: true, force: true }); });

const tabelas = (estoque = 5) => ({
  tenants: [{ id: LOJA, slug: 'loja', name: 'Loja', is_active: true, waitlist_enabled: true }],
  integration_whatsapp: [{ tenant_id: LOJA, is_active: true, provider: 'zapi', zapi_instance_id: 'INST1', zapi_token: 'tok', connected_phone: '5531900000000' }],
  products: [{ id: 1, tenant_id: LOJA, code: 'C210', name: 'Colar Aurora', price: 89.9, stock: estoque, is_active: true, sale_type: 'LIVE' }],
  customers: [], carts: [], cart_items: [], orders: [], whatsapp_messages: [], webhook_logs: [], fe_groups: [], fe_group_events: [],
  customer_whatsapp_groups: [], product_waitlist: [], sending_jobs: [], app_settings: [], allowed_groups: [],
});

const eventos = {
  conexao: { type: 'ConnectedCallback', instanceId: 'INST1', connectedPhone: '5531900000000' },
  desconexao: { type: 'DisconnectedCallback', instanceId: 'INST1', connectedPhone: '5531900000000', reason: 'teste' },
  entradaGrupo: { type: 'ReceivedCallback', notification: 'GROUP_PARTICIPANT_ADD', instanceId: 'INST1', phone: '120363000000000001-group', isGroup: true, notificationParameters: ['5531988887777'], participantPhone: '5531988887777', momment: 1700000000000 },
  saidaGrupo: { type: 'ReceivedCallback', notification: 'GROUP_PARTICIPANT_LEAVE', instanceId: 'INST1', phone: '120363000000000001-group', isGroup: true, notificationParameters: ['5531988887777'], participantPhone: '5531988887777', momment: 1700000000001 },
  statusLido: { type: 'MessageStatusCallback', instanceId: 'INST1', status: 'READ', ids: ['MSG1'], phone: '5531988887777' },
  semCodigo: { type: 'ReceivedCallback', instanceId: 'INST1', phone: '5531988887777', text: { message: 'oi, tudo bem?' }, messageId: 'M-1' },
  comCodigo: { type: 'ReceivedCallback', instanceId: 'INST1', isGroup: true, phone: '120363000000000001-group', chatName: 'Live Loja', participantPhone: '5531988887777', senderName: 'Ana', text: { message: 'quero C210x2' }, messageId: 'M-2' },
  comCodigoPrivado: { type: 'ReceivedCallback', instanceId: 'INST1', phone: '5531988887777', senderName: 'Ana', text: { message: 'quero C210x2' }, messageId: 'M-4' },
  divulgacao: { type: 'ReceivedCallback', instanceId: 'INST1', isGroup: true, phone: '120363000000000001-group', chatName: 'Live Loja', participantPhone: '5531988887777', text: { message: '🛍️ Para comprar, digite apenas o código: C210' }, messageId: 'M-3' },
  codigoInexistente: { type: 'ReceivedCallback', instanceId: 'INST1', isGroup: true, phone: '120363000000000001-group', chatName: 'Live Loja', participantPhone: '5531988887777', text: { message: 'C999' }, messageId: 'M-5' },
};

// Tira o que muda a cada execução (datas, ids aleatórios) para comparar só o comportamento.
const limpar = (v) => JSON.parse(JSON.stringify(v, (k, x) => {
  if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x)) return '<data>';
  if (typeof x === 'string') x = x.replace(/[\u200B-\u200D\u2060\uFEFF]/g, ''); // anti-bloqueio sorteia caracteres invisíveis
  if (typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(x) && x !== LOJA) return '<uuid>';
  if (['created_at', 'updated_at', 'last_seen', 'timestamp', 'event_at', 'processed_at'].includes(k)) return '<data>';
  return x;
}));

const randomReal = Math.random;
async function rodar(nome, evento, estoque) {
  // mesmo sorteio para as duas versões (anti-bloqueio sorteia saudação, emoji e caracteres invisíveis)
  let semente = 12345;
  Math.random = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fn = await loadEdgeFunction(nome, {
    tables: tabelas(estoque),
    rpc: { item_added_claim: () => 'send', reserve_send_slot: () => new Date().toISOString() },
    fetchHandler: async () => ({ status: 200, body: { id: 'x', messageId: 'x', value: true } }),
  });
  const r = await fn.call(evento);
  Math.random = randomReal;
  return limpar({ resposta: r, gravacoes: fn.sb.log.writes, rpc: fn.sb.log.rpc, invocacoes: fn.sb.log.invokes, chamadas: fn.calls.map((c) => ({ url: c.url, body: c.body })) });
}

for (const [nome, evento] of Object.entries(eventos)) {
  test(`mesmo comportamento antes e depois: ${nome}`, async () => {
    const antes = await rodar('__zapi_webhook_antes', evento, 5);
    const depois = await rodar('zapi-webhook', evento, 5);
    assert.deepEqual(depois, antes);
  });
}

test('produto com estoque MENOR que o pedido (pede 2, resta 1): antes a mensagem de esgotado/fila não saía (erro); agora sai pelo envio padrão — única diferença', async () => {
  const antes = await rodar('__zapi_webhook_antes', eventos.comCodigo, 1);
  const depois = await rodar('zapi-webhook', eventos.comCodigo, 1);
  const avisoAntes = antes.invocacoes.filter((i) => i.name === 'zapi-send-message');
  const avisoDepois = depois.invocacoes.filter((i) => i.name === 'zapi-send-message');
  assert.equal(avisoAntes.length, 0, 'antes: nenhum aviso');
  assert.equal(avisoDepois.length, 1, 'agora: um aviso');
  assert.match(avisoDepois[0].body.message, /Esgotado/);
  // antes o item caía em "erro inesperado" (a função de envio não existia); agora fica só "esgotado"
  const resultado = (x) => JSON.stringify(x.gravacoes).match(/Resultado:[^"]*/)?.[0];
  assert.match(resultado(antes), /unexpected_error/);
  assert.doesNotMatch(resultado(depois), /unexpected_error/);
  assert.match(resultado(depois), /out_of_stock/);
  // a fila de espera é chamada igual nos dois
  assert.deepEqual(depois.invocacoes.filter((i) => i.name === 'waitlist-enqueue'), antes.invocacoes.filter((i) => i.name === 'waitlist-enqueue'));
});

test('produto já zerado (estoque 0): aviso de esgotado sai igual antes e depois (caminho que já funcionava)', async () => {
  const antes = await rodar('__zapi_webhook_antes', eventos.comCodigo, 0);
  const depois = await rodar('zapi-webhook', eventos.comCodigo, 0);
  assert.deepEqual(depois, antes);
});
