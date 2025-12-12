-- Corrigir telefone do pedido com 10 dígitos (faltando o 9)
UPDATE orders 
SET customer_phone = CONCAT(SUBSTRING(customer_phone, 1, 2), '9', SUBSTRING(customer_phone, 3))
WHERE LENGTH(customer_phone) = 10;