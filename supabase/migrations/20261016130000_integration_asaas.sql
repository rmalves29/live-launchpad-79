-- Integração Asaas por empresa (hoje usada só pelo tenant Cartzy para cobrar a assinatura do site).
create table if not exists public.integration_asaas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  api_key text,
  webhook_token text,
  environment text not null default 'production' check (environment in ('production','sandbox')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integration_asaas enable row level security;
drop policy if exists "Tenant users can manage their Asaas integration" on public.integration_asaas;
create policy "Tenant users can manage their Asaas integration" on public.integration_asaas for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.tenant_id = integration_asaas.tenant_id or p.role = 'super_admin'::user_role)))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.tenant_id = integration_asaas.tenant_id or p.role = 'super_admin'::user_role)));
revoke all on public.integration_asaas from anon;
