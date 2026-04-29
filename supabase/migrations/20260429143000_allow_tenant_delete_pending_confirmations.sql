-- Permite que administradores do tenant removam confirmações pendentes
-- vinculadas aos seus próprios pedidos antes de deletar o pedido.
do $$
begin
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
