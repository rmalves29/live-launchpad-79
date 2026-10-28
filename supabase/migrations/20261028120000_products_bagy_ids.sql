-- Liga o produto do Cartzy ao produto/variação da Bagy (igual ao bling_product_id).
-- bagy_product_id: ID do produto na Bagy (o pai e os filhos de variação guardam o mesmo).
-- bagy_variation_id: ID da variação na Bagy (é nele que o estoque da Bagy é lido e gravado).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bagy_product_id bigint,
  ADD COLUMN IF NOT EXISTS bagy_variation_id bigint;

CREATE INDEX IF NOT EXISTS products_tenant_bagy_product_idx
  ON public.products (tenant_id, bagy_product_id)
  WHERE bagy_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_tenant_bagy_variation_idx
  ON public.products (tenant_id, bagy_variation_id)
  WHERE bagy_variation_id IS NOT NULL;
