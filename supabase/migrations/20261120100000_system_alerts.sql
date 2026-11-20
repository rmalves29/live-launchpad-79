-- Sininho de alertas do super admin (topo do sistema, ao lado de Tutoriais).
-- Uma linha por problema (rule_key). A checagem de saúde (cron, 15 min) abre/atualiza os problemas que encontra
-- e marca como resolvidos os que sumiram. Nada é enviado por WhatsApp: o admin vê os alertas no sininho.
create table if not exists public.system_alerts (
  rule_key     text primary key,
  severity     text not null check (severity in ('warn', 'error')),
  title        text not null,          -- o que está acontecendo
  problem      text,                   -- por que importa / o efeito para as lojas
  what_to_do   text,                   -- o que fazer
  detail       jsonb not null default '{}'::jsonb,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  resolved_at  timestamptz,            -- null = em aberto
  occurrences  integer not null default 1
);

create index if not exists system_alerts_open_idx on public.system_alerts (last_seen desc) where resolved_at is null;

alter table public.system_alerts enable row level security;

drop policy if exists "super admin vê alertas" on public.system_alerts;
create policy "super admin vê alertas" on public.system_alerts
  for select to authenticated using (public.is_super_admin());

-- Escrita só pela checagem (service role, que ignora RLS).
revoke insert, update, delete on public.system_alerts from anon, authenticated;
grant select on public.system_alerts to authenticated;
