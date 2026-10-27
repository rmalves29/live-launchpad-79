-- Renumera o SKU do sistema (code) dos produtos importados do Bling para a sequência C001, C002...
-- O código do Bling fica em sku_erp. Backup do código antigo em products_code_backup_20261027.
CREATE TABLE IF NOT EXISTS public.products_code_backup_20261027 AS
SELECT id, tenant_id, code AS old_code, sku_erp AS old_sku_erp FROM public.products
WHERE bling_product_id IS NOT NULL AND code !~* '^C[0-9]+$';
ALTER TABLE public.products_code_backup_20261027 ENABLE ROW LEVEL SECURITY;

UPDATE public.products SET sku_erp = code WHERE bling_product_id IS NOT NULL AND code !~* '^C[0-9]+$' AND (sku_erp IS NULL OR sku_erp = '');

WITH base AS (
  SELECT tenant_id, COALESCE(max(substr(code,2)::int) FILTER (WHERE code ~* '^C[0-9]{1,5}$'), 0) AS mx
  FROM public.products GROUP BY tenant_id
), todo AS (
  SELECT p.id, p.tenant_id, row_number() OVER (PARTITION BY p.tenant_id ORDER BY p.parent_product_id NULLS FIRST, p.created_at, p.id) AS rn
  FROM public.products p
  WHERE p.bling_product_id IS NOT NULL AND p.code !~* '^C[0-9]+$'
)
UPDATE public.products p SET code = 'C' || CASE WHEN b.mx + t.rn < 1000 THEN lpad((b.mx + t.rn)::text, 3, '0') ELSE (b.mx + t.rn)::text END, updated_at = now()
FROM todo t JOIN base b ON b.tenant_id = t.tenant_id
WHERE p.id = t.id;
