-- Atualizar customers apenas onde não haverá conflito
UPDATE customers c1
SET phone = SUBSTRING(c1.phone, 1, 2) || '9' || SUBSTRING(c1.phone, 3)
WHERE 
  LENGTH(c1.phone) = 10 
  AND SUBSTRING(c1.phone, 3, 1) = '9'
  AND CAST(SUBSTRING(c1.phone, 1, 2) AS INTEGER) >= 11
  AND CAST(SUBSTRING(c1.phone, 1, 2) AS INTEGER) <= 99
  AND NOT EXISTS (
    SELECT 1 FROM customers c2
    WHERE c2.tenant_id = c1.tenant_id
    AND c2.phone = SUBSTRING(c1.phone, 1, 2) || '9' || SUBSTRING(c1.phone, 3)
    AND c2.id != c1.id
  );

-- Atualizar orders (não tem constraint UNIQUE então é mais simples)
UPDATE orders
SET customer_phone = SUBSTRING(customer_phone, 1, 2) || '9' || SUBSTRING(customer_phone, 3)
WHERE 
  LENGTH(customer_phone) = 10 
  AND SUBSTRING(customer_phone, 3, 1) = '9'
  AND CAST(SUBSTRING(customer_phone, 1, 2) AS INTEGER) >= 11
  AND CAST(SUBSTRING(customer_phone, 1, 2) AS INTEGER) <= 99;

-- Atualizar carts
UPDATE carts
SET customer_phone = SUBSTRING(customer_phone, 1, 2) || '9' || SUBSTRING(customer_phone, 3)
WHERE 
  LENGTH(customer_phone) = 10 
  AND SUBSTRING(customer_phone, 3, 1) = '9'
  AND CAST(SUBSTRING(customer_phone, 1, 2) AS INTEGER) >= 11
  AND CAST(SUBSTRING(customer_phone, 1, 2) AS INTEGER) <= 99;

-- Atualizar whatsapp_messages
UPDATE whatsapp_messages
SET phone = SUBSTRING(phone, 1, 2) || '9' || SUBSTRING(phone, 3)
WHERE 
  LENGTH(phone) = 10 
  AND SUBSTRING(phone, 3, 1) = '9'
  AND CAST(SUBSTRING(phone, 1, 2) AS INTEGER) >= 11
  AND CAST(SUBSTRING(phone, 1, 2) AS INTEGER) <= 99;

-- Atualizar customer_whatsapp_groups
UPDATE customer_whatsapp_groups
SET customer_phone = SUBSTRING(customer_phone, 1, 2) || '9' || SUBSTRING(customer_phone, 3)
WHERE 
  LENGTH(customer_phone) = 10 
  AND SUBSTRING(customer_phone, 3, 1) = '9'
  AND CAST(SUBSTRING(customer_phone, 1, 2) AS INTEGER) >= 11
  AND CAST(SUBSTRING(customer_phone, 1, 2) AS INTEGER) <= 99;