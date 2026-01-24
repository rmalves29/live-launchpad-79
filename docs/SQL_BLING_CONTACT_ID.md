# Adicionar Campo bling_contact_id à Tabela Customers

Execute o SQL abaixo no **Supabase Dashboard > SQL Editor** para adicionar o campo que armazena o ID do contato no Bling:

```sql
-- ============================================================
-- MIGRAÇÃO: Adicionar bling_contact_id para evitar duplicação de contatos
-- ============================================================
-- Quando sincronizar pedidos com o Bling, o sistema irá:
-- 1. Verificar se o cliente já tem um bling_contact_id salvo
-- 2. Se sim, usar esse ID ao invés de criar novo contato
-- 3. Se não, buscar/criar no Bling e salvar o ID aqui
-- ============================================================

-- Adicionar coluna bling_contact_id
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS bling_contact_id BIGINT DEFAULT NULL;

-- Criar índice para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_customers_bling_contact_id 
ON public.customers(bling_contact_id) 
WHERE bling_contact_id IS NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN public.customers.bling_contact_id IS 
  'ID do contato no Bling ERP. Usado para evitar duplicação de contatos na sincronização.';
```

## Verificar Resultado

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'customers' AND column_name = 'bling_contact_id';
```

## Como Funciona

1. **Primeiro pedido do cliente**: Sistema busca no Bling pelo telefone/nome
   - Se encontrar → usa o ID e salva em `bling_contact_id`
   - Se não encontrar → cria novo contato e salva o ID
2. **Pedidos seguintes**: Sistema usa diretamente o `bling_contact_id` salvo
3. **Resultado**: Evita duplicação de contatos no Bling
