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

-- Agendamento (criado direto no banco, fora desta migração, porque a chave do serviço vai dentro do comando):
-- job 'olist-orders-sweep', a cada 2 minutos, chama a função olist-orders com {"action":"auto_sweep"}
-- (mesmo formato do job 'correios-auto-remessa').
