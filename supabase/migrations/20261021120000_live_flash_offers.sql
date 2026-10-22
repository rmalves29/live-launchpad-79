-- Oferta relâmpago da Loja da Live: um produto (e suas variações) com preço especial por tempo limitado.
-- O preço é decidido no servidor (live-shop): dentro do prazo vale o preço da oferta; depois volta ao normal.
create table if not exists public.live_flash_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  flash_price numeric(10,2) not null check (flash_price > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- só uma oferta no ar por empresa
create unique index if not exists live_flash_offers_one_active
  on public.live_flash_offers (tenant_id) where status = 'active';
create index if not exists live_flash_offers_tenant_idx on public.live_flash_offers (tenant_id, created_at desc);

alter table public.live_flash_offers enable row level security;

drop policy if exists "Tenant users can manage their flash offers" on public.live_flash_offers;
create policy "Tenant users can manage their flash offers" on public.live_flash_offers
  for all using ((tenant_id = get_current_tenant_id()) or is_super_admin())
  with check ((tenant_id = get_current_tenant_id()) or is_super_admin());
