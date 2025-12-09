-- Adicionar coluna loja_id na tabela bling_integrations (se não existir)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bling_integrations' AND column_name = 'loja_id') THEN
        ALTER TABLE bling_integrations ADD COLUMN loja_id text;
    END IF;
END $$;

-- Adicionar constraint única para bling_contacts (se não existir)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'bling_contacts_tenant_customer_unique') THEN
        ALTER TABLE bling_contacts 
        ADD CONSTRAINT bling_contacts_tenant_customer_unique UNIQUE (tenant_id, customer_key);
    END IF;
END $$;