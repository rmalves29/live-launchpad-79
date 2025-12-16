-- Migrate customer data from customers table to orders table
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
  AND o.customer_name IS NULL
  AND c.name IS NOT NULL;