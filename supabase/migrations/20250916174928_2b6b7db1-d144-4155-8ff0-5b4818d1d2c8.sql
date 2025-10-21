-- Reprocessar pedidos do tenant APP
UPDATE orders 
SET is_paid = false 
WHERE id IN (20, 21, 4) AND tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

UPDATE orders 
SET is_paid = true 
WHERE id IN (20, 21, 4) AND tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';