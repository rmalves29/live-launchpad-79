ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tiktok text;
ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS customer_tiktok text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_tiktok
  ON public.customers (tenant_id, lower(tiktok))
  WHERE tiktok IS NOT NULL AND btrim(tiktok) <> '';
CREATE INDEX IF NOT EXISTS idx_customers_tenant_instagram_lower
  ON public.customers (tenant_id, lower(instagram))
  WHERE instagram IS NOT NULL;