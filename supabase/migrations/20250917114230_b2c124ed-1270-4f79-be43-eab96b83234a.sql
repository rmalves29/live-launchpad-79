-- Add unique constraint to tenant_id in bling_integrations table
ALTER TABLE public.bling_integrations 
ADD CONSTRAINT bling_integrations_tenant_id_unique UNIQUE (tenant_id);