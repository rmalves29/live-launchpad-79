-- Reprocessar novamente o pedido #20 para testar a correção
UPDATE public.orders SET is_paid = false WHERE id = 20;
UPDATE public.orders SET is_paid = true WHERE id = 20;