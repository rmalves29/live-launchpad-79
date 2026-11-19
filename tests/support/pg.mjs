// Postgres de verdade, em memória (PGlite), para testar as funções SQL das migrações do Cartzy.
// Recria só o mínimo do ambiente do Supabase que as migrações precisam (papéis, cron, net, vault).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

const AMBIENTE_SUPABASE = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;

  create schema if not exists cron;
  create table if not exists cron.job (jobname text primary key, schedule text, command text);
  create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
    language sql as $$ insert into cron.job values (p_name, p_schedule, p_command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command; select 1::bigint $$;
  create or replace function cron.unschedule(p_name text) returns boolean
    language sql as $$ delete from cron.job where jobname = p_name; select true $$;

  -- net.http_post não sai para a internet: só grava a chamada para o teste conferir.
  create schema if not exists net;
  create table if not exists net.chamadas (id serial primary key, url text, headers jsonb, body jsonb, criado_em timestamptz default now());
  create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb,
    params jsonb default '{}'::jsonb, timeout_milliseconds int default 1000) returns bigint
    language sql as $$ insert into net.chamadas (url, headers, body) values (url, headers, body) returning id::bigint $$;

  create schema if not exists vault;
  create table if not exists vault.secrets (name text primary key, secret text);
  create or replace view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;

  create table if not exists public.tenants (id uuid primary key, name text);
`;

export async function novoBanco(sqlExtra = '') {
  const db = new PGlite();
  await db.exec(AMBIENTE_SUPABASE);
  if (sqlExtra) await db.exec(sqlExtra);
  return db;
}

export async function aplicarMigracao(db, arquivo) {
  const sql = readFileSync(path.join(ROOT, 'supabase/migrations', arquivo), 'utf8');
  await db.exec(sql);
}

export const linhas = async (db, sql, params = []) => (await db.query(sql, params)).rows;
export const valor = async (db, sql, params = []) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
