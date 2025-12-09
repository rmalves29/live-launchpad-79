-- Adicionar coluna loja_id na tabela bling_integrations
ALTER TABLE bling_integrations 
ADD COLUMN loja_id text;

-- Adicionar índice único para tenant_id para garantir upsert estável
ALTER TABLE bling_integrations 
ADD CONSTRAINT bling_integrations_tenant_id_unique UNIQUE (tenant_id);

-- Adicionar constraint única para bling_contacts (tenant_id, customer_key)
ALTER TABLE bling_contacts 
ADD CONSTRAINT bling_contacts_tenant_customer_unique UNIQUE (tenant_id, customer_key);