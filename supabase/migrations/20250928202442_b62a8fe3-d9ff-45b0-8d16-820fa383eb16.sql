-- Limpeza de dados inválidos de WhatsApp (grupos e números inválidos)

-- Remover mensagens de grupos (contém @g.us) ou números muito longos (IDs de grupos)
DELETE FROM whatsapp_messages 
WHERE phone LIKE '%@g.us%' 
   OR phone SIMILAR TO '[0-9]{15,}' 
   OR phone NOT SIMILAR TO '[0-9]{10,14}';

-- Remover carrinhos com números de grupos
DELETE FROM carts 
WHERE customer_phone LIKE '%@g.us%' 
   OR customer_phone SIMILAR TO '[0-9]{15,}' 
   OR customer_phone NOT SIMILAR TO '[0-9]{10,14}';

-- Remover pedidos com números de grupos  
DELETE FROM orders 
WHERE customer_phone LIKE '%@g.us%' 
   OR customer_phone SIMILAR TO '[0-9]{15,}' 
   OR customer_phone NOT SIMILAR TO '[0-9]{10,14}';

-- Remover clientes com números de grupos
DELETE FROM customers 
WHERE phone LIKE '%@g.us%' 
   OR phone SIMILAR TO '[0-9]{15,}' 
   OR phone NOT SIMILAR TO '[0-9]{10,14}';

-- Atualizar números com DDI 55 desnecessário nos clientes
UPDATE customers 
SET phone = SUBSTRING(phone FROM 3) 
WHERE phone LIKE '55%' 
  AND LENGTH(phone) = 13 
  AND SUBSTRING(phone FROM 3 FOR 2) SIMILAR TO '[1-9][1-9]';

-- Atualizar números com DDI 55 desnecessário nos carrinhos
UPDATE carts 
SET customer_phone = SUBSTRING(customer_phone FROM 3) 
WHERE customer_phone LIKE '55%' 
  AND LENGTH(customer_phone) = 13 
  AND SUBSTRING(customer_phone FROM 3 FOR 2) SIMILAR TO '[1-9][1-9]';

-- Atualizar números com DDI 55 desnecessário nos pedidos
UPDATE orders 
SET customer_phone = SUBSTRING(customer_phone FROM 3) 
WHERE customer_phone LIKE '55%' 
  AND LENGTH(customer_phone) = 13 
  AND SUBSTRING(customer_phone FROM 3 FOR 2) SIMILAR TO '[1-9][1-9]';

-- Atualizar números com DDI 55 desnecessário nas mensagens
UPDATE whatsapp_messages 
SET phone = SUBSTRING(phone FROM 3) 
WHERE phone LIKE '55%' 
  AND LENGTH(phone) = 13 
  AND SUBSTRING(phone FROM 3 FOR 2) SIMILAR TO '[1-9][1-9]';