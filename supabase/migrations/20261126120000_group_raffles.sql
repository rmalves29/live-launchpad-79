-- Histórico do sorteio entre participantes dos grupos de WhatsApp (função sorteio-grupos).
-- Gravado só pela função (service role); a loja só lê os próprios sorteios.
create table if not exists public.group_raffles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  groups_count int not null default 0,
  groups jsonb not null default '[]'::jsonb,
  groups_failed jsonb not null default '[]'::jsonb,
  participants_count int not null default 0,
  excluded_admins int not null default 0,
  excluded_phones text[] not null default '{}',
  no_phone_count int not null default 0,
  winners jsonb not null default '[]'::jsonb
);
create index if not exists group_raffles_tenant_created_idx on public.group_raffles (tenant_id, created_at desc);

alter table public.group_raffles enable row level security;

drop policy if exists "Loja vê os próprios sorteios de grupos" on public.group_raffles;
create policy "Loja vê os próprios sorteios de grupos" on public.group_raffles
  for select to authenticated
  using (
    tenant_id = (select public.get_current_tenant_id())
    or tenant_id in (select tu.tenant_id from public.tenant_users tu where tu.user_id = (select auth.uid()))
    or (select public.is_super_admin())
  );
