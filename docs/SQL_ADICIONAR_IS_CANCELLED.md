# Adicionar coluna is_cancelled na tabela orders

Execute o SQL abaixo no **Supabase Dashboard > SQL Editor**:

```sql
-- Adicionar coluna is_cancelled na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;

-- Criar índice para melhorar performance das consultas de pedidos cancelados
CREATE INDEX IF NOT EXISTS idx_orders_is_cancelled ON orders(is_cancelled);

-- Comentário para documentação
COMMENT ON COLUMN orders.is_cancelled IS 'Indica se o pedido foi cancelado. Pedidos cancelados não podem ser pagos.';
```

## O que esta coluna faz:

1. **Tela de Pedidos (`/pedidos`)**:
   - Novo filtro "Cancelados" no dropdown de status
   - Botão de cancelar/reverter em cada pedido
   - Pedidos cancelados aparecem com visual esmaecido e badge "Cancelado"
   - Pedidos pagos não podem ser cancelados
   - Cancelamento é reversível

2. **Checkout Público (`/t/{slug}/checkout`)**:
   - Pedidos cancelados aparecem com:
     - Checkbox desabilitado
     - Visual esmaecido (opacity-60)
     - Badge "Cancelado" em vermelho
     - Total exibido como "R$ 0,00"
     - Texto riscado nos produtos
   - Não podem ser selecionados para pagamento
