-- Adicionar coluna unique_order_id na tabela orders se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'unique_order_id') THEN
        ALTER TABLE orders ADD COLUMN unique_order_id text;
    END IF;
END $$;

-- Atualizar pedidos existentes que não têm unique_order_id
UPDATE orders 
SET unique_order_id = 'PED-' || EXTRACT(EPOCH FROM created_at)::bigint || '-' || id
WHERE unique_order_id IS NULL OR unique_order_id = '';

-- Criar índice único para garantir que não haja duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_order_id ON orders(unique_order_id);

-- Atualizar a função para usar o unique_order_id nos novos pedidos
CREATE OR REPLACE FUNCTION set_unique_order_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.unique_order_id IS NULL OR NEW.unique_order_id = '' THEN
        NEW.unique_order_id = 'PED-' || EXTRACT(EPOCH FROM now())::bigint || '-' || NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para novos pedidos
DROP TRIGGER IF EXISTS trigger_set_unique_order_id ON orders;
CREATE TRIGGER trigger_set_unique_order_id
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION set_unique_order_id();