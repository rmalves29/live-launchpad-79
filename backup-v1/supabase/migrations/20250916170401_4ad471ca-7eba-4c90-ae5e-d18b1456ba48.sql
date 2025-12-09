-- Atualizar a integração ME com dados válidos para o sandbox
UPDATE integration_me 
SET 
  from_name = 'MANIA DE MULHER ACESSORIOS LTDA',
  from_email = 'contato@maniadmulher.com', 
  from_phone = '31999999999',
  from_document = '11222333000181', -- CNPJ válido para sandbox
  from_address = 'Rua das Flores',
  from_number = '123',
  from_complement = 'Sala 101',
  from_district = 'Centro',
  from_city = 'Belo Horizonte',
  from_state = 'MG',
  updated_at = now()
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';