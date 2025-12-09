-- Reprocessar pedido #21 para garantir integração Melhor Envio
UPDATE public.orders SET is_paid = false WHERE id = 21;
UPDATE public.orders SET is_paid = true WHERE id = 21;