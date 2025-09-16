-- Etapa 4: Sincronizar dados existentes e testar
UPDATE integration_me 
SET 
  from_name = 'Mania de Mulher',
  from_email = 'glaucia.sa@hotmail.com',
  from_phone = '31993786530',
  from_document = '23059506000171',
  from_address = 'Rua Gávea',
  from_number = '337',
  from_complement = '',
  from_district = 'Lagoinha Leblon',
  from_city = 'Belo Horizonte',
  from_state = 'MG',
  from_cep = '31575060',
  updated_at = now()
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

-- Retrigar pedidos para teste
UPDATE orders 
SET is_paid = false 
WHERE id IN (20, 21, 4) AND tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

UPDATE orders 
SET is_paid = true 
WHERE id IN (20, 21, 4) AND tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';