-- Reprocessar o pedido #20 para importar no Melhor Envio
-- Marcar temporariamente como não pago para disparar o trigger e depois marcar como pago novamente
UPDATE public.orders SET is_paid = false WHERE id = 20;
UPDATE public.orders SET is_paid = true WHERE id = 20;