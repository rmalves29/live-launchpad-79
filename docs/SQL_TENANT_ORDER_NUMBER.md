# Adicionar Sequência de Pedidos por Tenant

Execute o SQL abaixo no **Supabase Dashboard > SQL Editor**:

```sql
-- ============================================================
-- MIGRAÇÃO: Adicionar tenant_order_number para sequência de pedidos por tenant
-- ============================================================
-- Cada tenant terá sua própria sequência de números de pedido
-- Ex: Tenant A -> 1, 2, 3... / Tenant B -> 1, 2, 3...
-- ============================================================

-- 1. Adicionar campo tenant_order_number
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_order_number INTEGER;

-- 2. Criar índice único composto para garantir unicidade por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_order_number 
ON orders(tenant_id, tenant_order_number) 
WHERE tenant_order_number IS NOT NULL;

-- 3. Função para definir tenant_order_number automaticamente (com lock para evitar race condition)
CREATE OR REPLACE FUNCTION set_tenant_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Só definir se ainda não tiver valor
  IF NEW.tenant_order_number IS NULL THEN
    -- Lock advisory para evitar race condition entre inserções simultâneas
    PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text || '_order_seq'));
    
    SELECT COALESCE(MAX(tenant_order_number), 0) + 1 INTO NEW.tenant_order_number
    FROM orders
    WHERE tenant_id = NEW.tenant_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Criar trigger para execução automática
DROP TRIGGER IF EXISTS trigger_set_tenant_order_number ON orders;
CREATE TRIGGER trigger_set_tenant_order_number
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION set_tenant_order_number();

-- 5. Atualizar pedidos existentes com tenant_order_number baseado na ordem de criação
-- Cada tenant terá sua sequência começando do 1
WITH numbered_orders AS (
  SELECT id, tenant_id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at, id) as row_num
  FROM orders
  WHERE tenant_order_number IS NULL
)
UPDATE orders o
SET tenant_order_number = no.row_num
FROM numbered_orders no
WHERE o.id = no.id;
```

## Verificar Resultado

Após executar, verifique se funcionou:

```sql
SELECT tenant_id, MIN(tenant_order_number), MAX(tenant_order_number), COUNT(*) 
FROM orders 
GROUP BY tenant_id;
```

## Como Funciona

1. **Novo campo `tenant_order_number`**: Armazena o número sequencial do pedido dentro de cada tenant
2. **Trigger automático**: Toda vez que um pedido é criado, o trigger calcula automaticamente o próximo número para aquele tenant
3. **Lock advisory**: Previne race conditions quando dois pedidos são criados simultaneamente
4. **Pedidos existentes**: São numerados na ordem de criação (created_at)
