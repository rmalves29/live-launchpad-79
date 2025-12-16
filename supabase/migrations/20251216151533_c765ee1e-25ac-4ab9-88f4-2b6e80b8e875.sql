
-- Recuperar dados do pedido #208 da tabela customers
UPDATE orders o
SET 
  customer_name = c.name,
  customer_cep = c.cep,
  customer_street = c.street,
  customer_number = c.number,
  customer_complement = c.complement,
  customer_city = c.city,
  customer_state = c.state
FROM customers c
WHERE o.customer_phone = c.phone 
  AND o.tenant_id = c.tenant_id
  AND o.id = 208
  AND c.cep IS NOT NULL;
