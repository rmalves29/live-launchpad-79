-- Adicionar campo sale_type na tabela products
ALTER TABLE products ADD COLUMN sale_type text NOT NULL DEFAULT 'BAZAR' CHECK (sale_type IN ('LIVE', 'BAZAR'));