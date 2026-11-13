-- Olist ERP: catálogo de produtos já buscado, guardado por empresa para a tela não precisar buscar de novo a cada visita.
-- Só a função olist-products (service role) lê e grava; RLS ligada sem políticas.
create table if not exists public.olist_catalog (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  olist_id bigint not null,
  sku text not null default '',
  nome text not null default '',
  preco numeric not null default 0,
  tipo text not null default '',
  variacao text not null default '',
  saldo integer not null default 0,
  synced_at timestamptz not null default now(),
  primary key (tenant_id, olist_id)
);
alter table public.olist_catalog enable row level security;
alter table public.integration_olist add column if not exists last_catalog_sync_at timestamptz;
