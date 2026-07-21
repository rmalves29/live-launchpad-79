-- Add parent_product_id to enable size variations
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS parent_product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_products_parent_product_id
  ON public.products(parent_product_id)
  WHERE parent_product_id IS NOT NULL;