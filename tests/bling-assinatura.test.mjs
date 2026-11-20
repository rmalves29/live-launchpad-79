// Avisos de produto/estoque do Bling só valem com assinatura de uma integração ATIVA.
// Quando falham, o registro diz por quê (sem assinatura, app de integração desativada ou app desconhecido).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createFakeSupabase } from './support/fake-supabase.mjs';
import { findIntegrationBySignature, diagnoseSignature } from '../supabase/functions/_shared/bling-product-sync.ts';

const corpo = JSON.stringify({ event: 'product.updated', eventId: 'e1', companyId: 'c1' });
const assina = (secret) => 'sha256=' + createHmac('sha256', secret).update(corpo).digest('hex');
const banco = () => createFakeSupabase({ tables: { integration_bling: [
  { tenant_id: 'ativa', is_active: true, client_secret: 'segredo-ativo' },
  { tenant_id: 'antiga', is_active: false, client_secret: 'segredo-antigo' },
] } });

test('assinatura da integração ativa é aceita', async () => {
  const integ = await findIntegrationBySignature(banco(), corpo, assina('segredo-ativo'));
  assert.equal(integ?.tenant_id, 'ativa');
});

test('assinatura de integração desativada é recusada e o motivo aponta a loja', async () => {
  assert.equal(await findIntegrationBySignature(banco(), corpo, assina('segredo-antigo')), null);
  assert.deepEqual(await diagnoseSignature(banco(), corpo, assina('segredo-antigo')), { motivo: 'app_de_integracao_desativada', tenant_id: 'antiga' });
});

test('sem assinatura ou de app desconhecido: recusado com o motivo certo', async () => {
  assert.equal(await findIntegrationBySignature(banco(), corpo, null), null);
  assert.deepEqual(await diagnoseSignature(banco(), corpo, null), { motivo: 'sem_assinatura' });
  assert.deepEqual(await diagnoseSignature(banco(), corpo, assina('outro')), { motivo: 'app_desconhecido' });
});

test('mesmo aplicativo em duas lojas: o companyId do aviso decide (nunca entrega para a loja errada)', async () => {
  const sb = () => createFakeSupabase({ tables: { integration_bling: [
    { tenant_id: 'mania', is_active: true, client_secret: 'segredo-comum', bling_company_id: 'emp-mania' },
    { tenant_id: 'elaup', is_active: true, client_secret: 'segredo-comum', bling_company_id: null },
  ] } });
  assert.equal((await findIntegrationBySignature(sb(), corpo, assina('segredo-comum'), 'emp-mania'))?.tenant_id, 'mania');
  assert.equal((await findIntegrationBySignature(sb(), corpo, assina('segredo-comum'), 'emp-outra'))?.tenant_id, 'elaup', 'só sobra a sem empresa cadastrada');
  assert.equal(await findIntegrationBySignature(sb(), corpo, assina('segredo-comum'), null), null, 'sem companyId e duas candidatas: recusa');
  assert.deepEqual(await diagnoseSignature(sb(), corpo, assina('segredo-comum')), { motivo: 'app_compartilhado_sem_empresa_cadastrada', tenants: ['mania', 'elaup'] });
});
