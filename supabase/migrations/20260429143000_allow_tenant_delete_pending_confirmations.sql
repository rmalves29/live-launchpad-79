-- Corrige o bloqueio ao deletar pedidos com confirmações pendentes.
-- 1) Permite limpeza manual pelo usuário autenticado do mesmo tenant.
-- 2) Garante integridade no banco com ON DELETE CASCADE para a FK order_id.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pending_message_confirmations'
      and policyname = 'Tenant users can view pending confirmations'
  ) then
    create policy "Tenant users can view pending confirmations"
      on public.pending_message_confirmations
      for select
      to authenticated
      using (
        is_super_admin()
        or (tenant_id = get_current_tenant_id())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pending_message_confirmations'
      and policyname = 'Tenant users can delete pending confirmations'
  ) then
    create policy "Tenant users can delete pending confirmations"
      on public.pending_message_confirmations
      for delete
      to authenticated
      using (
        is_super_admin()
        or (tenant_id = get_current_tenant_id())
      );
  end if;
end $$;

alter table public.pending_message_confirmations
  drop constraint if exists pending_message_confirmations_order_id_fkey;

alter table public.pending_message_confirmations
  add constraint pending_message_confirmations_order_id_fkey
  foreign key (order_id)
  references public.orders(id)
  on delete cascade;
