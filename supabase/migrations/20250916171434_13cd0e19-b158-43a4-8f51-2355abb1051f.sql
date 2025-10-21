-- Adicionar campos da empresa na tabela tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_document TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_phone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_number TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_complement TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_district TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_city TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_state TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_cep TEXT;

-- Atualizar dados do tenant "MANIA DE MULHER" com os dados corretos
UPDATE tenants 
SET 
  company_name = 'Mania de Mulher',
  company_document = '23059506000171',
  company_email = 'glaucia.sa@hotmail.com',
  company_phone = '31993786530',
  company_address = 'Rua Gávea',
  company_number = '337',
  company_complement = '',
  company_district = 'Lagoinha Leblon',
  company_city = 'Belo Horizonte',
  company_state = 'MG',
  company_cep = '31575060',
  updated_at = now()
WHERE slug = 'app';

-- Função para sincronizar dados da empresa com integrações
CREATE OR REPLACE FUNCTION sync_company_data_to_integrations()
RETURNS TRIGGER AS $$
BEGIN
  -- Sincronizar com Melhor Envio
  UPDATE integration_me
  SET 
    from_name = NEW.company_name,
    from_email = NEW.company_email,
    from_phone = NEW.company_phone,
    from_document = NEW.company_document,
    from_address = NEW.company_address,
    from_number = NEW.company_number,
    from_complement = NEW.company_complement,
    from_district = NEW.company_district,
    from_city = NEW.company_city,
    from_state = NEW.company_state,
    from_cep = NEW.company_cep,
    updated_at = now()
  WHERE tenant_id = NEW.id;

  -- Sincronizar com outras integrações futuras aqui
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para sincronização automática
DROP TRIGGER IF EXISTS sync_company_data_trigger ON tenants;
CREATE TRIGGER sync_company_data_trigger
  AFTER UPDATE OF company_name, company_document, company_email, company_phone, 
                 company_address, company_number, company_complement, company_district,
                 company_city, company_state, company_cep ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION sync_company_data_to_integrations();

-- Corrigir dados do Melhor Envio para o tenant correto (MANIA DE MULHER)
UPDATE integration_me 
SET 
  tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'
WHERE tenant_id = '3c92bf57-a114-4690-b4cf-642078fc9df9';

-- Executar sincronização inicial
UPDATE tenants SET updated_at = now() WHERE slug = 'app';