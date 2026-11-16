-- Pacote padrão para cotar frete, por empresa (antes era um único padrão global: 10 g por item e caixa 13x6x16 cm).
-- Cada empresa guarda o peso de UM item e as medidas da embalagem. Sem linha, o checkout usa o padrão global (app_settings).
-- Leitura liberada porque o checkout público precisa dos números; só a empresa (ou super admin) altera.
create table if not exists public.tenant_shipping_defaults (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg <= 30),
  width_cm numeric not null check (width_cm > 0 and width_cm <= 150),
  height_cm numeric not null check (height_cm > 0 and height_cm <= 150),
  length_cm numeric not null check (length_cm > 0 and length_cm <= 150),
  updated_at timestamptz not null default now()
);

alter table public.tenant_shipping_defaults enable row level security;

drop policy if exists "tenant_shipping_defaults leitura" on public.tenant_shipping_defaults;
create policy "tenant_shipping_defaults leitura" on public.tenant_shipping_defaults
  for select to anon, authenticated using (true);

drop policy if exists "tenant_shipping_defaults escrita" on public.tenant_shipping_defaults;
create policy "tenant_shipping_defaults escrita" on public.tenant_shipping_defaults
  for all to authenticated
  using (tenant_id = get_current_tenant_id() or is_super_admin())
  with check (tenant_id = get_current_tenant_id() or is_super_admin());
