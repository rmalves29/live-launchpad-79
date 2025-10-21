-- Criar um novo pedido de teste para enviar ao Bling
INSERT INTO orders (
  tenant_id, 
  customer_phone, 
  customer_name, 
  event_type, 
  event_date, 
  total_amount, 
  is_paid,
  customer_street,
  customer_number,
  customer_city,
  customer_state,
  customer_cep
) VALUES (
  '08f2b1b9-3988-489e-8186-c60f0c0b0622',
  '5531999887766',
  'João Silva Teste',
  'ANIVERSARIO',
  '2025-09-17',
  89.90,
  false,
  'Rua das Flores, 123',
  '456',
  'Belo Horizonte',
  'MG',
  '30112000'
);

-- Criar alguns itens para este pedido
INSERT INTO carts (tenant_id, customer_phone, event_type, event_date, status) 
VALUES ('08f2b1b9-3988-489e-8186-c60f0c0b0622', '5531999887766', 'ANIVERSARIO', '2025-09-17', 'CLOSED');

-- Pegar o ID do cart criado e criar itens
INSERT INTO cart_items (tenant_id, cart_id, product_id, qty, unit_price)
SELECT 
  '08f2b1b9-3988-489e-8186-c60f0c0b0622',
  c.id,
  p.id,
  2,
  p.price
FROM carts c, products p 
WHERE c.customer_phone = '5531999887766' 
  AND c.tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'
  AND p.tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'
  AND c.status = 'CLOSED'
ORDER BY c.created_at DESC, p.created_at ASC
LIMIT 1;

-- Vincular o cart ao pedido
UPDATE orders 
SET cart_id = (
  SELECT id FROM carts 
  WHERE customer_phone = '5531999887766' 
    AND tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'
    AND status = 'CLOSED'
  ORDER BY created_at DESC 
  LIMIT 1
)
WHERE customer_phone = '5531999887766' 
  AND tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'
  AND is_paid = false
ORDER BY created_at DESC
LIMIT 1;