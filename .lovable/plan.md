## Objetivo
Quando `consent_protection_enabled = false`, a função `zapi-send-item-added` deve enviar o template **"Item Adicionado ao Pedido"** (`template_item_added`) — e não o template de checkout com link.

## Mudanças

**`supabase/functions/zapi-send-item-added/index.ts`**

1. Em `getZAPICredentials`, incluir a coluna `template_item_added` no `select` e retorná-la junto com os demais templates.
2. No bloco "consent disabled" (criado na correção anterior):
   - Trocar `templateComLink || getDefaultTemplateComLink()` por `templateItemAdded || templateComLink || getDefaultTemplateComLink()`.
   - Não aplicar a substituição de `{{link_checkout}}` / `{{checkout_url}}` (o template "Item Adicionado" já contém a URL fixa configurada pelo lojista, conforme o registro atual da Roanne Jóias).
3. Redeploy da função.

## Resultado
- Tenant com proteção desativada → recebe o template **"Item Adicionado ao Pedido"** em todas as mensagens (sem máquina de estados).
- Tenant com proteção ativada → mantém o fluxo atual (Template A solicitação → Template B com link).