# Adicionar Campo customer_neighborhood à Tabela Orders

Execute o SQL abaixo no **Supabase Dashboard > SQL Editor** para adicionar o campo de bairro nos pedidos:

```sql
-- ============================================================
-- MIGRAÇÃO: Adicionar customer_neighborhood para corrigir etiquetas do Bling
-- ============================================================
-- O Bling ERP exige o bairro (neighborhood) para gerar etiquetas de envio.
-- Anteriormente o bairro só era salvo na tabela customers, causando falhas
-- quando o cliente não era encontrado pelo telefone.
-- ============================================================

-- Adicionar coluna customer_neighborhood
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_neighborhood TEXT DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN public.orders.customer_neighborhood IS 
  'Bairro do cliente para envio. Necessário para gerar etiquetas no Bling ERP.';

-- Atualizar pedidos existentes com o bairro do cliente cadastrado
UPDATE public.orders o
SET customer_neighborhood = c.neighborhood
FROM public.customers c
WHERE c.phone = o.customer_phone 
  AND c.tenant_id = o.tenant_id
  AND o.customer_neighborhood IS NULL
  AND c.neighborhood IS NOT NULL;
```

## Verificar Resultado

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'customer_neighborhood';
```

## O que foi corrigido

1. **Novo campo `customer_neighborhood`** na tabela `orders` para armazenar o bairro
2. **Edge Function `create-payment`** atualizada para salvar o bairro junto com os demais dados de endereço
3. **Edge Function `bling-sync-orders`** atualizada para usar o bairro do pedido como fallback quando o cliente não for encontrado
4. **Pedidos existentes** são atualizados automaticamente com o bairro do cliente cadastrado
