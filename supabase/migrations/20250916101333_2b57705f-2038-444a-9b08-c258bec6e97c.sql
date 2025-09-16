-- Add unique constraints to integration tables
ALTER TABLE integration_mp ADD CONSTRAINT integration_mp_tenant_id_unique UNIQUE (tenant_id);
ALTER TABLE integration_me ADD CONSTRAINT integration_me_tenant_id_unique UNIQUE (tenant_id);

-- Add tenant_key column 
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_key TEXT;
UPDATE tenants SET tenant_key = slug WHERE tenant_key IS NULL;