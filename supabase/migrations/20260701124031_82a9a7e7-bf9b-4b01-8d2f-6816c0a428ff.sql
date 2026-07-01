
ALTER TABLE public.product_promotions
  ADD COLUMN IF NOT EXISTS promotion_type text NOT NULL DEFAULT 'buy_x_get_y',
  ADD COLUMN IF NOT EXISTS tiers jsonb;

ALTER TABLE public.product_promotions
  DROP CONSTRAINT IF EXISTS product_promotions_type_check;

ALTER TABLE public.product_promotions
  ADD CONSTRAINT product_promotions_type_check
  CHECK (promotion_type IN ('buy_x_get_y', 'progressive_qty'));

-- Permitir buy_qty/get_qty 0 quando tipo for progressive
ALTER TABLE public.product_promotions ALTER COLUMN buy_qty DROP NOT NULL;
ALTER TABLE public.product_promotions ALTER COLUMN get_qty DROP NOT NULL;
ALTER TABLE public.product_promotions ALTER COLUMN discount_percent DROP NOT NULL;
