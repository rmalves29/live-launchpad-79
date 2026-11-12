-- Integração Olist ERP (API v3), recriada do zero.
-- Tokens: access 4 h, refresh 1 dia. A renovação roda a cada 2 h (cron de 30 em 30 min vê quem está na hora).
-- Segredos (client_secret, access_token, refresh_token) nunca saem do servidor: RLS ligado e SEM políticas,
-- então só as edge functions (service role) leem e gravam. A tela só vê o status que a função olist-oauth devolve.
create table if not exists public.integration_olist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  -- sem_credenciais | aguardando_autorizacao | ativa | erro | reautorizar
  status text not null default 'sem_credenciais'
    check (status in ('sem_credenciais', 'aguardando_autorizacao', 'ativa', 'erro', 'reautorizar')),
  is_active boolean not null default false,
  oauth_state text,                       -- uso único, anti-CSRF do login
  oauth_state_expires_at timestamptz,
  authorized_at timestamptz,
  last_refresh_at timestamptz,
  next_refresh_at timestamptz,
  refreshing_at timestamptz,              -- trava: só uma renovação por empresa por vez
  refresh_failures integer not null default 0,
  first_failure_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integration_olist enable row level security;
-- sem políticas de propósito (service role ignora RLS)

create index if not exists integration_olist_due_idx
  on public.integration_olist (next_refresh_at)
  where is_active and refresh_token is not null;

create or replace function public.integration_olist_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists integration_olist_touch on public.integration_olist;
create trigger integration_olist_touch
  before update on public.integration_olist
  for each row execute function public.integration_olist_touch();
