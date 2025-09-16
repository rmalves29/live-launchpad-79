-- Adicionar campos de endereço na tabela orders para resolver problemas de integração com Melhor Envio
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS customer_name text,
ADD COLUMN IF NOT EXISTS customer_cep text,
ADD COLUMN IF NOT EXISTS customer_street text,
ADD COLUMN IF NOT EXISTS customer_number text,
ADD COLUMN IF NOT EXISTS customer_complement text,
ADD COLUMN IF NOT EXISTS customer_city text,
ADD COLUMN IF NOT EXISTS customer_state text;