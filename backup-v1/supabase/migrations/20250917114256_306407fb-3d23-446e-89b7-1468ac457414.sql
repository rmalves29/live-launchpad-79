-- Remove duplicate records from bling_integrations, keeping only the most recent
DELETE FROM public.bling_integrations a
USING public.bling_integrations b
WHERE a.tenant_id = b.tenant_id 
  AND a.created_at < b.created_at;

-- Add unique constraint to tenant_id in bling_integrations table
ALTER TABLE public.bling_integrations 
ADD CONSTRAINT bling_integrations_tenant_id_unique UNIQUE (tenant_id);