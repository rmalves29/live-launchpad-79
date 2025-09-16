-- Remove foreign key constraints from integration tables to allow super_admin users
-- Super admins should be able to configure integrations without being tied to a specific tenant

-- Drop foreign key constraints
ALTER TABLE integration_whatsapp DROP CONSTRAINT IF EXISTS integration_whatsapp_tenant_id_fkey;
ALTER TABLE payment_integrations DROP CONSTRAINT IF EXISTS payment_integrations_tenant_id_fkey;
ALTER TABLE shipping_integrations DROP CONSTRAINT IF EXISTS shipping_integrations_tenant_id_fkey;
ALTER TABLE bling_integrations DROP CONSTRAINT IF EXISTS bling_integrations_tenant_id_fkey;

-- Make tenant_id nullable since super_admins don't have a tenant
ALTER TABLE integration_whatsapp ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE payment_integrations ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE shipping_integrations ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE bling_integrations ALTER COLUMN tenant_id DROP NOT NULL;