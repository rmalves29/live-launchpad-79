-- Marcar pedido #24 como não pago para poder testá-lo novamente
UPDATE orders 
SET is_paid = false 
WHERE id = 24 AND tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

-- Agora marcar como pago para ativar o trigger que envia para o Bling
UPDATE orders 
SET is_paid = true 
WHERE id = 24 AND tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';