-- 1. Deletar clientes duplicados (sem o 9) quando já existe o registro correto (com o 9)
DELETE FROM customers c1
WHERE LENGTH(REGEXP_REPLACE(c1.phone, '\D', '', 'g')) = 10
  AND EXISTS (
    SELECT 1 FROM customers c2
    WHERE c2.tenant_id = c1.tenant_id
      AND REGEXP_REPLACE(c2.phone, '\D', '', 'g') = 
          SUBSTRING(REGEXP_REPLACE(c1.phone, '\D', '', 'g'), 1, 2) || '9' || SUBSTRING(REGEXP_REPLACE(c1.phone, '\D', '', 'g'), 3)
  );

-- 2. Atualizar telefones de 10 dígitos para 11 dígitos (adicionar o 9)

-- Customers
UPDATE customers
SET phone = SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g'), 1, 2) || '9' || SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g'), 3),
    updated_at = now()
WHERE LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) = 10;

-- Orders - customer_phone
UPDATE orders
SET customer_phone = SUBSTRING(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 1, 2) || '9' || SUBSTRING(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 3)
WHERE LENGTH(REGEXP_REPLACE(customer_phone, '\D', '', 'g')) = 10;

-- Carts - customer_phone
UPDATE carts
SET customer_phone = SUBSTRING(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 1, 2) || '9' || SUBSTRING(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 3)
WHERE LENGTH(REGEXP_REPLACE(customer_phone, '\D', '', 'g')) = 10;

-- Customer WhatsApp Groups - customer_phone
UPDATE customer_whatsapp_groups
SET customer_phone = SUBSTRING(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 1, 2) || '9' || SUBSTRING(REGEXP_REPLACE(customer_phone, '\D', '', 'g'), 3),
    updated_at = now()
WHERE LENGTH(REGEXP_REPLACE(customer_phone, '\D', '', 'g')) = 10;

-- MKT_MM - phone
UPDATE mkt_mm
SET phone = SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g'), 1, 2) || '9' || SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g'), 3),
    updated_at = now()
WHERE LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) = 10;

-- WhatsApp Messages - phone
UPDATE whatsapp_messages
SET phone = SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g'), 1, 2) || '9' || SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g'), 3),
    updated_at = now()
WHERE LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) = 10;