-- Testar o trigger com o pedido #20
UPDATE public.orders SET is_paid = false WHERE id = 20;
UPDATE public.orders SET is_paid = true WHERE id = 20;