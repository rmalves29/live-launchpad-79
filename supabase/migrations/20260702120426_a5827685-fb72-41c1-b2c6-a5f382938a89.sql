ALTER TABLE public.product_promotions DROP CONSTRAINT IF EXISTS product_promotions_buy_qty_check;
ALTER TABLE public.product_promotions DROP CONSTRAINT IF EXISTS product_promotions_get_qty_check;
ALTER TABLE public.product_promotions DROP CONSTRAINT IF EXISTS product_promotions_discount_percent_check;
ALTER TABLE public.product_promotions ADD CONSTRAINT product_promotions_buy_qty_check CHECK (buy_qty IS NULL OR buy_qty >= 0);
ALTER TABLE public.product_promotions ADD CONSTRAINT product_promotions_get_qty_check CHECK (get_qty IS NULL OR get_qty >= 0);
ALTER TABLE public.product_promotions ADD CONSTRAINT product_promotions_discount_percent_check CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));