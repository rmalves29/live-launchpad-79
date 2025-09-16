-- Adicionar colunas para integração com Mercado Pago na tabela frete_envios
ALTER TABLE frete_envios 
ADD COLUMN IF NOT EXISTS cart_id text,
ADD COLUMN IF NOT EXISTS service_price numeric,
ADD COLUMN IF NOT EXISTS payment_link text;