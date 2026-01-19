# Adicionar colunas bling_store_id e bling_store_name

Execute este SQL no Supabase SQL Editor para adicionar as colunas necessárias:

```sql
-- Adicionar colunas para configuração de loja Bling
ALTER TABLE integration_bling 
ADD COLUMN IF NOT EXISTS bling_store_id BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS bling_store_name TEXT DEFAULT NULL;

-- Atualizar a loja padrão OrderZap (opcional - apenas se quiser usar a loja já configurada)
-- UPDATE integration_bling SET bling_store_id = 205905895, bling_store_name = 'OrderZap' WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

## O que foi alterado

1. **Tabela `integration_bling`**: Novas colunas `bling_store_id` e `bling_store_name` para armazenar a configuração de canal de venda.

2. **Componente `BlingIntegration`**: Adicionado seletor de canal de venda que lista as lojas disponíveis no Bling.

3. **Edge Function `bling-sync-orders`**: Agora lê o `bling_store_id` do banco em vez de usar um valor fixo.
