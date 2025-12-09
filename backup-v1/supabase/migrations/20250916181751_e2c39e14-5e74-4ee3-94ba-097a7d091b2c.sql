-- Reprocessar pedidos com erro para testar correções
UPDATE orders 
SET is_paid = false 
WHERE id IN (20, 21, 22, 4) AND is_paid = true;

-- Forçar novo processamento
UPDATE orders 
SET is_paid = true 
WHERE id IN (20, 21, 22, 4);