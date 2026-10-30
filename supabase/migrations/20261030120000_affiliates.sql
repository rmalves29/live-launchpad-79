-- Afiliadas da Loja da Live.
-- Cada afiliada tem link próprio (/t/:slug/live/a/:codigo), vitrine própria (affiliate_products), comissão sobre os pedidos
-- que chegarem por ela e permissões (oferta relâmpago, cupons, frete grátis) liberadas pelo lojista, com limites.
-- Liberado por empresa em tenants.enable_afiliados (desligado por padrão).

alter table public.tenants add column if not exists enable_afiliados boolean not null default false;

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  phone text,
  email text,
  pix_key text,
  commission_percent numeric(5,2) not null default 10 check (commission_percent >= 0 and commission_percent <= 100),
  is_active boolean not null default true,
  access_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  allow_flash boolean not null default false,
  allow_coupons boolean not null default false,
  allow_free_shipping boolean not null default false,
  flash_max_concurrent integer not null default 1 check (flash_max_concurrent between 0 and 10),
  flash_max_minutes integer not null default 30 check (flash_max_minutes between 1 and 1440),
  flash_max_discount_pct numeric(5,2) not null default 30 check (flash_max_discount_pct between 0 and 100),
  coupon_max_active integer not null default 3 check (coupon_max_active between 0 and 50),
  coupon_max_discount_pct numeric(5,2) not null default 10 check (coupon_max_discount_pct between 0 and 100),
  coupon_min_order numeric(10,2) not null default 0 check (coupon_min_order >= 0),
  ship_min_order numeric(10,2) not null default 150 check (ship_min_order >= 0),
  free_ship_min numeric(10,2) check (free_ship_min is null or free_ship_min >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists affiliates_tenant_code_idx on public.affiliates (tenant_id, upper(code));
create index if not exists affiliates_tenant_idx on public.affiliates (tenant_id);

create table if not exists public.affiliate_products (
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  position integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (affiliate_id, product_id)
);
create index if not exists affiliate_products_product_idx on public.affiliate_products (product_id);

alter table public.orders add column if not exists affiliate_id uuid references public.affiliates(id) on delete set null;
alter table public.orders add column if not exists affiliate_commission_percent numeric(5,2);
alter table public.orders add column if not exists affiliate_commission_amount numeric(10,2);
alter table public.orders add column if not exists affiliate_paid_at timestamptz;
create index if not exists orders_affiliate_idx on public.orders (affiliate_id) where affiliate_id is not null;

alter table public.coupons add column if not exists affiliate_id uuid references public.affiliates(id) on delete cascade;
create index if not exists coupons_affiliate_idx on public.coupons (affiliate_id) where affiliate_id is not null;

alter table public.live_flash_offers add column if not exists affiliate_id uuid references public.affiliates(id) on delete cascade;

-- oferta: o mesmo produto não tem duas ofertas no ar no mesmo "dono" (loja ou afiliada)
drop index if exists public.live_flash_offers_one_active_per_product;
create unique index if not exists live_flash_offers_one_active_per_product
  on public.live_flash_offers (tenant_id, product_id, coalesce(affiliate_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'active';

-- limite de ofertas ao mesmo tempo: 2 para a loja; para a afiliada vale o limite que o lojista deu a ela
create or replace function public.live_flash_offers_limit()
returns trigger language plpgsql set search_path = public as $$
declare
  v_limit integer := 2;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if new.affiliate_id is not null then
    select flash_max_concurrent into v_limit from public.affiliates where id = new.affiliate_id;
    v_limit := coalesce(v_limit, 0);
  end if;
  if (
    select count(*) from public.live_flash_offers o
     where o.tenant_id = new.tenant_id and o.status = 'active' and o.ends_at > now() and o.id <> new.id
       and o.affiliate_id is not distinct from new.affiliate_id
  ) >= v_limit then
    raise exception 'max_flash_offers: limite de ofertas relâmpago ao mesmo tempo atingido';
  end if;
  return new;
end $$;

alter table public.affiliates enable row level security;
alter table public.affiliate_products enable row level security;

drop policy if exists "Tenant users manage their affiliates" on public.affiliates;
create policy "Tenant users manage their affiliates" on public.affiliates
  for all using ((tenant_id = get_current_tenant_id()) or is_super_admin())
  with check ((tenant_id = get_current_tenant_id()) or is_super_admin());

drop policy if exists "Tenant users manage affiliate products" on public.affiliate_products;
create policy "Tenant users manage affiliate products" on public.affiliate_products
  for all using (exists (select 1 from public.affiliates a where a.id = affiliate_id and ((a.tenant_id = get_current_tenant_id()) or is_super_admin())))
  with check (exists (select 1 from public.affiliates a where a.id = affiliate_id and ((a.tenant_id = get_current_tenant_id()) or is_super_admin())));

-- só a OrderZap começa com a função ligada
update public.tenants set enable_afiliados = true where slug = 'orderzap';
