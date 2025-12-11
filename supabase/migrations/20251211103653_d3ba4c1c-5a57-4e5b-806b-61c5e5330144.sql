-- Adicionar coluna neighborhood (bairro) na tabela customers
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS neighborhood text;