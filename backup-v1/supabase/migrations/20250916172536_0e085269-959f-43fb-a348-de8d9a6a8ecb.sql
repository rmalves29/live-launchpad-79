-- Etapa 3: Criar função para sincronização automática e trigger
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