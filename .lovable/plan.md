

# Plano: Adicionar variáveis de preço promocional nos templates WhatsApp

## O que será feito
Adicionar suporte às variáveis `{{valor_original}}` e `{{valor_promo}}` nos templates de mensagem WhatsApp (Item Adicionado, Cobrança, etc.), para que o cliente possa exibir "De R$ X por R$ Y" nas mensagens.

## Alterações

### 1. Template Types — Frontend (`src/pages/whatsapp/Templates.tsx`)
- Adicionar `{{valor_original}}` e `{{valor_promo}}` na lista de variáveis do tipo `ITEM_ADDED` e `PAID_ORDER`

### 2. DB Trigger — Nova migration
- Alterar a função `send_whatsapp_on_item_added()` para buscar `promotional_price` da tabela `products` (atualmente só busca `price`)
- Passar `original_price` no payload JSON enviado à edge function

### 3. Edge Function (`supabase/functions/zapi-send-item-added/index.ts`)
- Adicionar `original_price` na interface `ItemAddedRequest`
- Na função `formatMessage`, adicionar substituição de `{{valor_original}}` e `{{valor_promo}}`
- Se não houver preço promocional, remover automaticamente as linhas que contenham essas variáveis (mesmo comportamento do SendFlow)

## Lógica
- `{{valor}}` continua sendo o preço efetivo (promocional se existir, senão original)
- `{{valor_original}}` = preço original do produto (`product.price`)
- `{{valor_promo}}` = preço promocional (`product.promotional_price`)
- Se não houver preço promocional, linhas com `{{valor_original}}` e `{{valor_promo}}` são removidas automaticamente

## Detalhes técnicos

**Migration SQL:**
```sql
CREATE OR REPLACE FUNCTION public.send_whatsapp_on_item_added()
-- Adiciona promotional_price no SELECT e original_price no jsonb_build_object
```

**Edge function:** Mesma lógica já usada no `sendflow-process` para tratar linhas com variáveis vazias.

