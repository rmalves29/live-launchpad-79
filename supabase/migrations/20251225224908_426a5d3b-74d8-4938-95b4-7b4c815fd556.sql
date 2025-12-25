-- Corrigir telefone do pedido #241
UPDATE public.orders
SET customer_phone = '31992904210'
WHERE id = 241 AND customer_phone = '3192904210';

-- Corrigir telefone do cart #213
UPDATE public.carts
SET customer_phone = '31992904210'
WHERE id = 213 AND customer_phone = '3192904210';