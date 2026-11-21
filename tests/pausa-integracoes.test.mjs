// Pausa automática das integrações de lojas com assinatura vencida há mais de 10 dias
// e retomada imediata quando a loja renova (migração 20261121010000_pausa_integracoes_lojas_vencidas.sql).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, aplicarMigracao, linhas, valor } from './support/pg.mjs';

const VENCIDA = 'aaaaaaaa-0000-4000-8000-000000000001';      // venceu há 30 dias, sem pedidos
const VENDENDO = 'aaaaaaaa-0000-4000-8000-000000000002';     // venceu há 30 dias, mas vendeu ontem
const RECENTE = 'aaaaaaaa-0000-4000-8000-000000000003';      // venceu há 5 dias
const EM_DIA = 'aaaaaaaa-0000-4000-8000-000000000004';       // assinatura válida
const INTERNA = 'aaaaaaaa-0000-4000-8000-000000000005';      // sem data de vencimento (loja interna)
const TABELAS = ['integration_bling', 'integration_olist', 'integration_bagy', 'integration_omie',
  'integration_instagram', 'integration_whatsapp', 'shipping_integrations'];

let db;

beforeEach(async () => {
  db = await novoBanco(`
    create schema if not exists private;
    alter table public.tenants add column is_active boolean default true,
      add column is_blocked boolean default false, add column subscription_ends_at timestamptz;
    create or replace function public.is_super_admin() returns boolean language sql as $$ select false $$;
    create table public.orders (id serial primary key, tenant_id uuid, created_at timestamptz default now());
    ${TABELAS.map((t) => `create table public.${t} (id uuid primary key default gen_random_uuid(), tenant_id uuid, is_active boolean, provider text);`).join('\n')}
    -- limite de 1 transportadora ativa por loja, como o gatilho de produção
    create function public.max_frete() returns trigger language plpgsql as $$ begin
      if new.is_active and exists (select 1 from public.shipping_integrations s
          where s.tenant_id = new.tenant_id and s.is_active and s.id <> new.id) then
        raise exception 'limite de transportadoras ativas'; end if; return new; end $$;
    create trigger t_max before update of is_active on public.shipping_integrations for each row execute function public.max_frete();

    insert into public.tenants (id, name, subscription_ends_at) values
      ('${VENCIDA}', 'Vencida', now() - interval '30 days'),
      ('${VENDENDO}', 'Vendendo', now() - interval '30 days'),
      ('${RECENTE}', 'Recente', now() - interval '5 days'),
      ('${EM_DIA}', 'Em dia', now() + interval '30 days'),
      ('${INTERNA}', 'Interna', null);
    insert into public.orders (tenant_id, created_at) values ('${VENDENDO}', now() - interval '1 day'),
      ('${VENCIDA}', now() - interval '40 days');
  `);
  for (const loja of [VENCIDA, VENDENDO, RECENTE, EM_DIA, INTERNA]) {
    await db.exec(`
      insert into public.integration_bling (tenant_id, is_active) values ('${loja}', true);
      insert into public.integration_whatsapp (tenant_id, is_active) values ('${loja}', true);
      insert into public.integration_instagram (tenant_id, is_active) values ('${loja}', false);
      insert into public.shipping_integrations (tenant_id, is_active, provider) values ('${loja}', true, 'correios'), ('${loja}', false, 'melhor_envio');
    `);
  }
  await aplicarMigracao(db, '20261121010000_pausa_integracoes_lojas_vencidas.sql');
});

const ativas = (loja) => linhas(db, `
  select 'bling' t from integration_bling where tenant_id = $1 and is_active
  union all select 'whatsapp' from integration_whatsapp where tenant_id = $1 and is_active
  union all select 'instagram' from integration_instagram where tenant_id = $1 and is_active
  union all select 'frete:' || provider from shipping_integrations where tenant_id = $1 and is_active
  order by 1`, [loja]).then((r) => r.map((x) => x.t));

test('pausa só a loja vencida há mais de 10 dias e sem pedido nos últimos 10 dias', async () => {
  await db.query(`select public.integracoes_pausar_lojas_vencidas(10)`);
  assert.deepEqual(await ativas(VENCIDA), []);
  assert.deepEqual(await ativas(VENDENDO), ['bling', 'frete:correios', 'whatsapp'], 'vendeu ontem: não pausa');
  assert.deepEqual(await ativas(RECENTE), ['bling', 'frete:correios', 'whatsapp'], 'venceu há 5 dias: não pausa');
  assert.deepEqual(await ativas(EM_DIA), ['bling', 'frete:correios', 'whatsapp']);
  assert.deepEqual(await ativas(INTERNA), ['bling', 'frete:correios', 'whatsapp'], 'sem data de vencimento: nunca pausa');
  const reg = await linhas(db, `select tabela, motivo from integration_auto_pauses where tenant_id = $1 order by tabela`, [VENCIDA]);
  assert.deepEqual(reg.map((r) => r.tabela), ['integration_bling', 'integration_whatsapp', 'shipping_integrations']);
  assert.match(reg[0].motivo, /assinatura vencida em .* e sem pedidos há 10 dias/);
});

test('simulação não muda nada', async () => {
  const r = await linhas(db, `select * from public.integracoes_pausar_lojas_vencidas(10, true)`);
  assert.equal(r.reduce((s, x) => s + x.integracoes, 0), 3);
  assert.deepEqual(await ativas(VENCIDA), ['bling', 'frete:correios', 'whatsapp']);
  assert.equal(await valor(db, `select count(*)::int from integration_auto_pauses`), 0);
});

test('rodar duas vezes não duplica registro', async () => {
  await db.query(`select public.integracoes_pausar_lojas_vencidas(10)`);
  await db.query(`select public.integracoes_pausar_lojas_vencidas(10)`);
  assert.equal(await valor(db, `select count(*)::int from integration_auto_pauses`), 3);
});

test('renovou: religa na hora só o que foi pausado (o que a loja tinha desligado continua desligado)', async () => {
  await db.query(`select public.integracoes_pausar_lojas_vencidas(10)`);
  await db.exec(`update public.tenants set subscription_ends_at = now() + interval '30 days' where id = '${VENCIDA}'`);
  assert.deepEqual(await ativas(VENCIDA), ['bling', 'frete:correios', 'whatsapp']);
  assert.equal(await valor(db, `select count(*)::int from integration_auto_pauses where resumed_at is null`), 0);
});

test('mexer na loja sem renovar não religa', async () => {
  await db.query(`select public.integracoes_pausar_lojas_vencidas(10)`);
  await db.exec(`update public.tenants set subscription_ends_at = now() - interval '1 day' where id = '${VENCIDA}'`);
  assert.deepEqual(await ativas(VENCIDA), []);
  await db.exec(`update public.tenants set subscription_ends_at = now() + interval '30 days', is_blocked = true where id = '${VENCIDA}'`);
  assert.deepEqual(await ativas(VENCIDA), [], 'renovou mas está bloqueada: continua pausada');
  await db.exec(`update public.tenants set is_blocked = false where id = '${VENCIDA}'`);
  assert.deepEqual(await ativas(VENCIDA), ['bling', 'frete:correios', 'whatsapp'], 'desbloqueou: religa');
});

test('loja ligou outra transportadora no meio tempo: não quebra a renovação e registra o motivo', async () => {
  await db.query(`select public.integracoes_pausar_lojas_vencidas(10)`);
  await db.exec(`update public.shipping_integrations set is_active = true where tenant_id = '${VENCIDA}' and provider = 'melhor_envio'`);
  await db.exec(`update public.tenants set subscription_ends_at = now() + interval '30 days' where id = '${VENCIDA}'`);
  assert.deepEqual(await ativas(VENCIDA), ['bling', 'frete:melhor_envio', 'whatsapp']);
  const [r] = await linhas(db, `select resultado from integration_auto_pauses where tabela = 'shipping_integrations'`);
  assert.match(r.resultado, /não religada: limite de transportadoras/);
});

test('rotina diária agendada às 03h15 de Brasília', async () => {
  const [j] = await linhas(db, `select schedule, command from cron.job where jobname = 'pausa-integracoes-lojas-vencidas'`);
  assert.equal(j.schedule, '15 6 * * *');
  assert.match(j.command, /integracoes_pausar_lojas_vencidas\(10\)/);
});
