// Alertas do super admin (sininho no topo): quais situações viram alerta e como o quadro abre/atualiza/resolve sozinho.
// Nada é enviado por WhatsApp (decisão do Rafael, 20/11/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './support/fake-supabase.mjs';
import { evaluateHealth } from '../supabase/functions/_shared/health-rules.ts';
import { syncSystemAlerts } from '../supabase/functions/_shared/system-alerts.ts';

const AGORA = Date.parse('2026-11-20T12:00:00Z');
const min = (m) => new Date(AGORA - m * 60_000).toISOString();

function banco(extra = {}, rpc = {}) {
  return createFakeSupabase({
    tables: {
      internal_call_audit: [], webhook_logs: [], sending_jobs: [], whatsapp_active_sessions: [], push_campaigns: [], bling_sync_logs: [],
      integration_bling: [],
      tenants: [{ id: 'mania', name: 'MANIA DE MULHER' }, { id: 'elaup', name: 'Ela Up' }, { id: 'pabeli', name: 'Pabeli' }],
      ...extra,
    },
    rpc: { admin_health_cron_failures: () => [], ...rpc },
  });
}
const chaves = (alerts) => alerts.map((a) => a.key).sort();

test('sistema saudável: nenhum alerta', async () => {
  assert.deepEqual(await evaluateHealth(banco(), AGORA), []);
});

test('webhook com mais de 20% de erro na última hora vira alerta (com o nome amigável)', async () => {
  const logs = [
    ...Array.from({ length: 12 }, () => ({ webhook_type: 'bling_product:assinatura_invalida', status_code: 401, created_at: min(10) })),
    ...Array.from({ length: 30 }, () => ({ webhook_type: 'mercadopago_webhook', status_code: 200, created_at: min(10) })),
  ];
  const a = await evaluateHealth(banco({ webhook_logs: logs }), AGORA);
  assert.deepEqual(chaves(a), ['webhook_error_rate_bling_product:assinatura_invalida']);
  assert.match(a[0].title, /Bling \(product\): assinatura inválida: 100% de erro/);
});

test('WhatsApp: só conta sessão que caiu nas últimas 24h (sessões antigas eram ruído)', async () => {
  const sess = [
    { phone_number: '553173025695', status: 'disconnected', last_heartbeat: '2026-01-27T17:06:03Z' },
    { phone_number: '5531999990000', status: 'disconnected', last_heartbeat: min(30) },
  ];
  const a = await evaluateHealth(banco({ whatsapp_active_sessions: sess }), AGORA);
  assert.deepEqual(chaves(a), ['whatsapp_disconnected']);
  assert.match(a[0].title, /5531999990000/);
  assert.doesNotMatch(a[0].title, /553173025695/);
});

test('Bling: sem credenciais, acesso vencido e aplicativo compartilhado entre lojas', async () => {
  const integ = [
    { tenant_id: 'pabeli', is_active: true, client_id: null, client_secret: null, token_expires_at: min(-60) },
    { tenant_id: 'mania', is_active: true, client_id: 'app1', client_secret: 's', token_expires_at: min(-60), bling_company_id: 'e056' },
    { tenant_id: 'elaup', is_active: true, client_id: 'app1', client_secret: 's', token_expires_at: min(180), bling_company_id: null },
  ];
  const a = await evaluateHealth(banco({ integration_bling: integ }), AGORA);
  assert.deepEqual(chaves(a), ['bling_app_compartilhado_app1', 'bling_sem_credenciais_pabeli', 'bling_token_vencido_elaup']);
  assert.match(a.find((x) => x.key.startsWith('bling_app')).title, /MANIA DE MULHER, Ela Up/);
});

test('Bling: 5+ falhas de envio de pedido na última hora por loja', async () => {
  const logs = [
    ...Array.from({ length: 5 }, () => ({ tenant_id: 'mania', status: 'error', action: 'mark_attended', created_at: min(20) })),
    ...Array.from({ length: 4 }, () => ({ tenant_id: 'elaup', status: 'error', action: 'send_order', created_at: min(20) })),
    ...Array.from({ length: 9 }, () => ({ tenant_id: 'elaup', status: 'error', action: 'send_order', created_at: min(120) })),
  ];
  const a = await evaluateHealth(banco({ bling_sync_logs: logs }), AGORA);
  assert.deepEqual(chaves(a), ['bling_falhas_envio_mania']);
});

test('tarefa agendada falhando vira alerta com o último erro', async () => {
  const a = await evaluateHealth(banco({}, { admin_health_cron_failures: () => [{ jobname: 'orders-auto-cancel', failures: 3, last_error: 'timeout' }] }), AGORA);
  assert.deepEqual(chaves(a), ['cron_falhando_orders-auto-cancel']);
  assert.match(a[0].problem, /timeout/);
});

test('cada alerta diz o problema e o que fazer', async () => {
  const integ = [{ tenant_id: 'pabeli', is_active: true, client_id: null, client_secret: null }];
  const [a] = await evaluateHealth(banco({ integration_bling: integ }), AGORA);
  assert.match(a.title, /Pabeli/);
  assert.ok(a.problem && a.hint, 'tem problema e o que fazer');
});

test('quadro do sininho: abre o novo, atualiza o que continua e resolve o que sumiu', async () => {
  const sb = createFakeSupabase({ tables: { system_alerts: [] } });
  const A = { key: 'a', severity: 'error', title: 'A', problem: 'pa', hint: 'ha', detail: {} };
  const B = { key: 'b', severity: 'warn', title: 'B', detail: {} };

  let r = await syncSystemAlerts(sb, [A, B], new Date(AGORA));
  assert.deepEqual(r, { open: 2, opened: 2, resolved: 0 });
  assert.equal(sb.db.system_alerts.find((x) => x.rule_key === 'a').what_to_do, 'ha');

  r = await syncSystemAlerts(sb, [A], new Date(AGORA + 15 * 60_000));
  assert.deepEqual(r, { open: 1, opened: 0, resolved: 1 });
  const a = sb.db.system_alerts.find((x) => x.rule_key === 'a');
  assert.equal(a.occurrences, 2);
  assert.equal(a.resolved_at, null);
  assert.ok(sb.db.system_alerts.find((x) => x.rule_key === 'b').resolved_at, 'B resolvido: some do sininho');

  r = await syncSystemAlerts(sb, [A, B], new Date(AGORA + 30 * 60_000));
  assert.equal(r.opened, 1, 'B voltou: conta como novo');
  assert.equal(sb.db.system_alerts.find((x) => x.rule_key === 'b').resolved_at, null);
});

test('P-03: chamada sem identificação à função interna aparece no sininho (só as das últimas 24h)', async () => {
  const audit = [
    { fn: 'zapi-send-item-added', caller: 'sem_chave', created_at: min(30) },
    { fn: 'zapi-send-item-added', caller: 'sem_chave', created_at: min(60) },
    { fn: 'zapi-send-item-added', caller: 'internal_key', created_at: min(10) },
    { fn: 'zapi-send-item-added', caller: 'sem_chave', created_at: min(60 * 30) },
  ];
  const a = await evaluateHealth(banco({ internal_call_audit: audit }), AGORA);
  assert.deepEqual(chaves(a), ['chamada_sem_chave_zapi-send-item-added']);
  assert.match(a[0].title, /^2 chamada/);
});
