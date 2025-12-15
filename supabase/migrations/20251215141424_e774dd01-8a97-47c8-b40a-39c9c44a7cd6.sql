-- Add snapshot image url to cart_items so deleted products can still render normally
ALTER TABLE public.cart_items
ADD COLUMN IF NOT EXISTS product_image_url text;

-- Backfill snapshot image url for existing rows (only where product still exists)
UPDATE public.cart_items ci
SET product_image_url = p.image_url
FROM public.products p
WHERE ci.product_id = p.id
  AND ci.product_image_url IS NULL;

-- Optional index for faster lookups by cart
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items (cart_id);
