-- Etapa 2: Atualizar dados do tenant "MANIA DE MULHER" com os dados corretos
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