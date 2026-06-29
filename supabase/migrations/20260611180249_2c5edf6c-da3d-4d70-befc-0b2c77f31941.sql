
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Backfill: pedidos com cart_id provavelmente vieram do webhook do WhatsApp ou storefront
UPDATE public.orders
SET source = 'webhook'
WHERE source IS NULL OR source = 'manual'
  AND cart_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_source ON public.orders(source);
