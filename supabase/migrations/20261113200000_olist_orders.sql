-- Olist ERP: envio de pedidos pagos (fase 3) e nota fiscal / rastreio (fase 4).
-- Tudo DESLIGADO por padrão; cada empresa liga o que quiser na tela da Olist.
alter table public.integration_olist
  add column if not exists send_orders boolean not null default false,      -- permite enviar pedidos à Olist
  add column if not exists auto_send boolean not null default false,        -- envia sozinho quando o pedido fica pago
  add column if not exists order_situacao integer not null default 3,       -- situação em que o pedido entra (3 = Aprovada)
  add column if not exists issue_invoice boolean not null default false,    -- gera e emite a nota fiscal depois do envio
  add column if not exists invoice_model integer not null default 55,       -- 55 NF-e, 65 NFC-e
  add column if not exists sync_tracking boolean not null default false,    -- traz o código de rastreio de volta
  add column if not exists send_from timestamptz;                           -- só envia pedidos pagos a partir daqui (evita subir o histórico)

alter table public.orders
  add column if not exists olist_order_id bigint,
  add column if not exists olist_order_number text,
  add column if not exists olist_sync_status text,        -- processing | synced | error | skipped
  add column if not exists olist_sync_error text,
  add column if not exists olist_attempts integer not null default 0,
  add column if not exists olist_last_attempt_at timestamptz,
  add column if not exists olist_invoice_id bigint,
  add column if not exists olist_invoice_status text,     -- generated | issued | error
  add column if not exists olist_invoice_error text;

create index if not exists orders_olist_pending_idx
  on public.orders (tenant_id, paid_at)
  where is_paid and olist_order_id is null;
create index if not exists orders_olist_tracking_idx
  on public.orders (tenant_id)
  where olist_order_id is not null and melhor_envio_tracking_code is null;

alter table public.customers add column if not exists olist_contact_id bigint;

-- Agendamento: a cada 2 minutos manda para a Olist os pedidos pagos das empresas com envio automático
-- e, a cada rodada, confere o rastreio. Mesmo padrão dos outros agendamentos (app.supabase_url / app.service_role_key).
create or replace function public.olist_orders_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  supabase_url text := current_setting('app.supabase_url', true);
  service_key text := current_setting('app.service_role_key', true);
begin
  if supabase_url is null or service_key is null then return; end if;
  perform net.http_post(
    url := supabase_url || '/functions/v1/olist-orders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := jsonb_build_object('action', 'auto_sweep')
  );
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('olist-orders-sweep');
exception when others then null;
end $$;
do $$
begin
  perform cron.schedule('olist-orders-sweep', '*/2 * * * *', 'select public.olist_orders_tick()');
exception when others then null;
end $$;
