-- Drop the existing check constraint and recreate with AMBOS option
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sale_type_check;

ALTER TABLE public.products ADD CONSTRAINT products_sale_type_check 
  CHECK (sale_type IN ('BAZAR', 'LIVE', 'AMBOS'));