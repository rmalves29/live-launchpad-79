-- Avisos (webhooks) do Bling de produto e estoque: o Bling pode entregar o mesmo aviso mais de uma vez e fora de ordem.
-- Guardamos o eventId para não reprocessar. Só a service role escreve aqui (RLS ligada, sem policy).
create table if not exists public.bling_webhook_events (
  event_id text primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  event text,
  result text,
  created_at timestamptz not null default now()
);
create index if not exists bling_webhook_events_created_idx on public.bling_webhook_events (created_at);
alter table public.bling_webhook_events enable row level security;
