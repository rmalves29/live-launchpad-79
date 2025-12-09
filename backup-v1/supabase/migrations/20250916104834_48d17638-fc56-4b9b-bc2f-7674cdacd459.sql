-- Teste: marcar pedido como pago para verificar se o trigger funciona
UPDATE orders SET is_paid = true WHERE id = 17;