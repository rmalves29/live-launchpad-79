-- Estoque ERP → Cartzy: conferência automática a cada 15 minutos (Bling, Olist, Bagy) + painel de saúde.
--
-- erp_stock_sync_state: uma linha por loja e ERP. Guarda onde a conferência parou (cursor), quando rodou,
-- quando chegou o último aviso do ERP, quantos produtos estão sem ligação e se a conferência foi pausada por segurança.
create table if not exists public.erp_stock_sync_state (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  erp text not null check (erp in ('bling', 'olist', 'bagy')),
  cursor text,
  link_cursor text,
  last_run_at timestamptz,
  last_full_cycle_at timestamptz,
  last_event_at timestamptz,
  last_change_at timestamptz,
  changes_last_run integer not null default 0,
  linked_last_run integer not null default 0,
  unlinked_count integer,
  deposit_source text,
  paused_reason text,
  safety_ack boolean not null default false,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, erp)
);

alter table public.erp_stock_sync_state enable row level security;

drop policy if exists erp_stock_sync_state_read on public.erp_stock_sync_state;
create policy erp_stock_sync_state_read on public.erp_stock_sync_state
  for select to authenticated
  using (tenant_id = public.get_current_tenant_id() or public.is_super_admin());

-- A loja pode "liberar" uma conferência pausada (limpa paused_reason) pela tela.
drop policy if exists erp_stock_sync_state_unpause on public.erp_stock_sync_state;
create policy erp_stock_sync_state_unpause on public.erp_stock_sync_state
  for update to authenticated
  using (tenant_id = public.get_current_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.get_current_tenant_id() or public.is_super_admin());

grant select, update on public.erp_stock_sync_state to authenticated;

-- Quantidade que o Cartzy já tirou do estoque mas o ERP ainda não sabe:
-- itens de pedidos abertos/pagos que ainda não foram enviados a esse ERP (e não cancelados nem devolvidos),
-- carrinhos ainda sem pedido e reservas da loja da live. Sem isso a conferência devolveria ao Cartzy
-- peças que já estão no carrinho de alguém (venda dobrada).
create or replace function public.erp_pending_qty(p_tenant uuid, p_erp text, p_product_ids bigint[])
returns table (product_id bigint, qty bigint)
language sql
stable
security definer
set search_path = public
as $$
  with itens as (
    select ci.product_id::bigint as product_id, ci.qty::bigint as qty
      from public.cart_items ci
      join public.carts c on c.id = ci.cart_id
      left join public.orders o on o.cart_id = c.id
     where ci.tenant_id = p_tenant
       and ci.product_id = any(p_product_ids)
       and ci.created_at > now() - interval '45 days'
       and (
         o.id is null
         or (
           coalesce(o.is_cancelled, false) = false
           and coalesce(o.stock_restored, false) = false
           and case p_erp
                 when 'bling' then o.bling_order_id is null
                 when 'olist' then o.olist_order_id is null
                 when 'bagy'  then o.bagy_order_id is null
                 else false
               end
         )
       )
    union all
    select r.product_id, r.qty::bigint
      from public.live_cart_reservations r
     where r.tenant_id = p_tenant
       and r.product_id = any(p_product_ids)
       and (r.expires_at is null or r.expires_at > now())
  )
  select product_id, sum(qty)::bigint from itens group by product_id;
$$;

revoke all on function public.erp_pending_qty(uuid, text, bigint[]) from public, anon, authenticated;
grant execute on function public.erp_pending_qty(uuid, text, bigint[]) to service_role;

-- Produtos ativos que não estão ligados ao ERP (sem o id do ERP), sem contar os pais de variações.
create or replace function public.erp_unlinked_count(p_tenant uuid, p_erp text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.products p
   where p.tenant_id = p_tenant
     and p.is_active
     and case p_erp
           when 'bling' then p.bling_product_id is null
           when 'olist' then p.olist_product_id is null
           when 'bagy'  then p.bagy_variation_id is null
           else false
         end
     and not exists (select 1 from public.products k where k.parent_product_id = p.id);
$$;

revoke all on function public.erp_unlinked_count(uuid, text) from public, anon, authenticated;
grant execute on function public.erp_unlinked_count(uuid, text) to service_role;

-- Agendamento: a cada 15 minutos (minutos 7, 22, 37, 52 para não cair junto com os outros).
-- Usa o mesmo segredo exclusivo do agendador da Olist (olist_cron_secret).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'olist_cron_secret') then
    raise exception 'Scheduler secret (olist_cron_secret) is missing';
  end if;
  if exists (select 1 from cron.job where jobname = 'erp-stock-reconcile') then
    perform cron.unschedule('erp-stock-reconcile');
  end if;
  perform cron.schedule('erp-stock-reconcile', '7,22,37,52 * * * *', $command$
    select net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/erp-stock-reconcile',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-olist-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'olist_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    ) as request_id;
  $command$);
end $$;

notify pgrst, 'reload schema';
