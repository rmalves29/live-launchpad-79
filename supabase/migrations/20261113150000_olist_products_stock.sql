-- Olist ERP: depósito escolhido e vínculo dos produtos do Cartzy com os produtos da Olist.
-- deposit_id/deposit_name: depósito de onde vem o saldo (como no Bling). olist_product_id: id do produto na Olist
-- (o código ERP, sku_erp, continua sendo a chave de reserva quando o produto ainda não está vinculado).
alter table public.integration_olist
  add column if not exists deposit_id bigint,
  add column if not exists deposit_name text,
  add column if not exists last_stock_sync_at timestamptz;

alter table public.products
  add column if not exists olist_product_id bigint;

create index if not exists products_olist_product_idx
  on public.products (tenant_id, olist_product_id)
  where olist_product_id is not null;
