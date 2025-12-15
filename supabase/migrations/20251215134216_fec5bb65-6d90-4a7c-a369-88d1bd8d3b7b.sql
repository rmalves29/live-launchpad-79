-- Adicionar colunas para armazenar dados do produto no momento da compra
ALTER TABLE cart_items 
ADD COLUMN IF NOT EXISTS product_name text,
ADD COLUMN IF NOT EXISTS product_code text;

-- Preencher os dados existentes
UPDATE cart_items ci
SET 
  product_name = p.name,
  product_code = p.code
FROM products p
WHERE ci.product_id = p.id
  AND ci.product_name IS NULL;

-- Alterar product_id para nullable
ALTER TABLE cart_items 
ALTER COLUMN product_id DROP NOT NULL;

-- Remover a foreign key existente
ALTER TABLE cart_items 
DROP CONSTRAINT IF EXISTS cart_items_product_id_fkey;

-- Recriar com ON DELETE SET NULL
ALTER TABLE cart_items 
ADD CONSTRAINT cart_items_product_id_fkey 
FOREIGN KEY (product_id) 
REFERENCES products(id) 
ON DELETE SET NULL;