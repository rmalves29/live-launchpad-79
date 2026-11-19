// Pedido enviado ao Bling: baixa o estoque no depósito escolhido e vai como "Atendido" (situação 9).
// Exceção (commit 82ced93, 18/11/2026): em lojas SEM transportadora com API, o "Atendido" do Bling vale
// como postagem e dispararia o "pedido enviado" antes da hora; ali o pedido fica "Em aberto".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { extractFunctions } from './support/extract.mjs';
import { createFakeSupabase } from './support/fake-supabase.mjs';
import { silenceLogs } from './support/edge.mjs';
import { erpCanConfirmPostage, isPostedStatus, isPostedFromEvents } from '../supabase/functions/_shared/postage-confirmation.ts';

const LOJA = '66666666-6666-4666-8666-666666666666';
let restore;
before(() => { restore = silenceLogs(); });
after(() => restore());

const delay = () => Promise.resolve();
const { blingFetchWithRetry } = extractFunctions('supabase/functions/bling-sync-orders/index.ts', ['blingFetchWithRetry'], { delay });
const { finalizeAsAttended } = extractFunctions('supabase/functions/bling-sync-orders/index.ts', ['finalizeAsAttended'], {
  BLING_API_URL: 'https://api.bling.com.br/Api/v3', blingFetchWithRetry, erpCanConfirmPostage,
});

function blingFalso() {
  const chamadas = [];
  globalThis.fetch = async (url, init = {}) => { chamadas.push({ url: String(url), method: init.method }); return new Response('{}', { status: 200 }); };
  return chamadas;
}

const banco = (transportadoras) => createFakeSupabase({ tables: {
  integration_bling: [{ tenant_id: LOJA, bling_deposit_id: 555 }],
  shipping_integrations: transportadoras.map((provider) => ({ tenant_id: LOJA, provider, is_active: true })),
  bling_sync_logs: [],
} });

test('loja com transportadora com API (ex.: Melhor Envio): baixa estoque e marca "Atendido"', async () => {
  const chamadas = blingFalso();
  const sb = banco(['melhor_envio']);
  await finalizeAsAttended('tok', sb, LOJA, 123);
  assert.deepEqual(chamadas.map((c) => `${c.method} ${c.url.replace('https://api.bling.com.br/Api/v3', '')}`), [
    'POST /pedidos/vendas/123/lancar-estoque/555',
    'PATCH /pedidos/vendas/123/situacoes/9',
  ]);
  assert.equal(sb.db.bling_sync_logs[0].status, 'success');
});

test('loja SEM transportadora com API: baixa estoque mas mantém "Em aberto" (Atendido = postagem nessa loja)', async () => {
  const chamadas = blingFalso();
  const sb = banco([]);
  await finalizeAsAttended('tok', sb, LOJA, 124);
  assert.deepEqual(chamadas.map((c) => `${c.method} ${c.url.replace('https://api.bling.com.br/Api/v3', '')}`), [
    'POST /pedidos/vendas/124/lancar-estoque/555',
  ]);
});

test('transportadora sem API de rastreio (ex.: Correios manual) conta como "sem API"', async () => {
  assert.equal(await erpCanConfirmPostage(banco(['correios']), LOJA), true);
  assert.equal(await erpCanConfirmPostage(banco(['mandae']), LOJA), false);
});

test('Bling instável (429): tenta de novo antes de desistir', async () => {
  let n = 0;
  globalThis.fetch = async () => new Response('{}', { status: ++n < 3 ? 429 : 200 });
  const r = await blingFetchWithRetry('https://api.bling.com.br/Api/v3/x', { method: 'PATCH' }, { maxAttempts: 3 });
  assert.equal(r.response.status, 200);
  assert.equal(n, 3);
});

test('"pedido enviado" só sai com postagem real: etiqueta gerada não conta', () => {
  assert.equal(isPostedStatus('Objeto postado'), true);
  assert.equal(isPostedStatus('Em trânsito'), true);
  assert.equal(isPostedStatus('Etiqueta gerada'), false);
  assert.equal(isPostedStatus('Aguardando postagem'), false);
  assert.equal(isPostedFromEvents({ status: 'created', postedAt: null }), false, 'nome de campo não dispara a mensagem');
  assert.equal(isPostedFromEvents([{ status: 'Coleta realizada' }]), true);
});
