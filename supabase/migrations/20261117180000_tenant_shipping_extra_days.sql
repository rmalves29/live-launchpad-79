-- Dias adicionais no prazo das transportadoras de integração (Correios, Melhor Envio, SuperFrete, Frenet, Mandae, Manda Bem, Frete Barato...).
-- Um número por empresa, somado ao prazo de cada serviço cotado no checkout (público, antigo e live).
-- Leitura liberada porque o checkout público precisa do número; só a empresa (ou super admin) altera.
create table if not exists public.tenant_shipping_prazo (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  extra_delivery_days integer not null default 0 check (extra_delivery_days >= 0 and extra_delivery_days <= 60),
  updated_at timestamptz not null default now()
);

alter table public.tenant_shipping_prazo enable row level security;

drop policy if exists "tenant_shipping_prazo leitura" on public.tenant_shipping_prazo;
create policy "tenant_shipping_prazo leitura" on public.tenant_shipping_prazo
  for select to anon, authenticated using (true);

drop policy if exists "tenant_shipping_prazo escrita" on public.tenant_shipping_prazo;
create policy "tenant_shipping_prazo escrita" on public.tenant_shipping_prazo
  for all to authenticated
  using (tenant_id = get_current_tenant_id() or is_super_admin())
  with check (tenant_id = get_current_tenant_id() or is_super_admin());
