-- New stores start at NULL and are picked before previously processed stores.
alter table public.integration_olist add column if not exists orders_last_sweep_at timestamptz;
create index if not exists integration_olist_sweep_rotation_idx
  on public.integration_olist (orders_last_sweep_at asc nulls first, tenant_id)
  where is_active and send_orders;
