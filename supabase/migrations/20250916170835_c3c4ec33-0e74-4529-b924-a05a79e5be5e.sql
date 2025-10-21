-- Atualizar configuração ME com dados reais da Mania de Mulher
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
WHERE tenant_id = '3c92bf57-a114-4690-b4cf-642078fc9df9';

-- Retrigar os pedidos para testar com os dados reais
UPDATE orders 
SET is_paid = false 
WHERE id IN (20, 21, 4) AND tenant_id = '3c92bf57-a114-4690-b4cf-642078fc9df9';

UPDATE orders 
SET is_paid = true 
WHERE id IN (20, 21, 4) AND tenant_id = '3c92bf57-a114-4690-b4cf-642078fc9df9';