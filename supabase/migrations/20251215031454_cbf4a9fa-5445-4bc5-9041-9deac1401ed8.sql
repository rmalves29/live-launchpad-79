-- Adicionar campos para armazenar dados do Melhor Envio nos pedidos
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS melhor_envio_shipment_id TEXT,
ADD COLUMN IF NOT EXISTS melhor_envio_tracking_code TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.orders.melhor_envio_shipment_id IS 'ID da remessa no Melhor Envio';
COMMENT ON COLUMN public.orders.melhor_envio_tracking_code IS 'Código de rastreio do Melhor Envio';