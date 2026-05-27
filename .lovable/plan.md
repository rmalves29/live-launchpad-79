## Objetivo
Tornar a tabela `whatsapp_templates` (type=`ITEM_ADDED`) a **fonte oficial** do template enviado quando um item é adicionado ao pedido — exatamente o que aparece na tela **WhatsApp → Templates** (Cartzy). Assim, o que a lojista editar nessa tela é o que o cliente recebe.

## Causa do problema atual
A edge function `zapi-send-item-added` hoje lê o template da coluna **legada** `integration_whatsapp.template_item_added`, que em 13 tenants ainda contém literalmente a linha `📦 Qtd: {{qtd_aleatoria}}`. Como a variável `{{qtd_aleatoria}}` foi removida do código, o texto cru chega no WhatsApp do cliente.

A tabela `whatsapp_templates` (a que a UI Cartzy edita) está limpa — nenhum registro contém `qtd_aleatoria`.

## Mudanças

### 1. Edge function — passar a usar `whatsapp_templates`
Arquivo: `supabase/functions/zapi-send-item-added/index.ts`

- A função `getTemplate(supabase, tenantId)` (linha 168) já busca de `whatsapp_templates` com type=`ITEM_ADDED`. Vou usá-la como **fonte primária** nos dois pontos onde o template é resolvido:
  - **Linha 561** (modo legado, sem proteção de consentimento) — hoje: `templateItemAdded || templateComLink || default`. Nova ordem:
    ```
    template = await getTemplate(supabase, tenant_id)   // whatsapp_templates
            || templateItemAdded                          // fallback legado
            || templateComLink
            || getDefaultTemplateComLink()
    ```
  - **Linha 611** (modo consentimento, branch `send_with_link`) — mesma lógica acima.
  - **Linha 602** (branch `send_request`, primeira mensagem pedindo consentimento) — continua usando `templateSolicitacao` (template diferente, "Solicitação"), **não muda**.

- Comportamento de variáveis em `formatMessage` permanece o mesmo: `{{quantidade}}` é substituído pela quantidade real do evento, `{{produto}}`, `{{codigo}}`, `{{valor}}/{{preco}}` etc. continuam funcionando. Se a lojista não colocar `{{quantidade}}` no template, nada de quantidade aparece.

### 2. SQL — sanitizar resíduos antigos (executar uma vez no SQL Editor)
Mesmo com a fonte trocada, vamos limpar o lixo da coluna legada para não confundir leituras futuras e cobrir qualquer tenant que ainda caia no fallback:

```sql
-- Remove a linha "📦 Qtd: {{qtd_aleatoria}}" (ou variantes) dos templates legados
UPDATE integration_whatsapp
SET template_item_added = regexp_replace(
      template_item_added,
      E'\\n?[^\\n]*\\{\\{qtd_aleatoria\\}\\}[^\\n]*',
      '',
      'g'
    ),
    updated_at = now()
WHERE template_item_added ILIKE '%qtd_aleatoria%';

-- Também limpa qualquer ocorrência em whatsapp_templates (defensivo — atualmente 0 linhas)
UPDATE whatsapp_templates
SET content = regexp_replace(
      content,
      E'\\n?[^\\n]*\\{\\{qtd_aleatoria\\}\\}[^\\n]*',
      '',
      'g'
    ),
    updated_at = now()
WHERE content ILIKE '%qtd_aleatoria%';
```

### 3. Tenants futuros
A função `create_default_whatsapp_templates` já insere o template padrão de `ITEM_ADDED` em `whatsapp_templates` com `{{quantidade}}` correto. ✅ Sem alteração.

## Resultado esperado
- A lojista edita o template em **WhatsApp → Templates** (card ITEM_ADDED) → é exatamente isso que o cliente recebe.
- `C100` no grupo/live → mensagem mostra os campos que ela colocou no template (com `{{quantidade}}` = 1 se ela usar a variável; sem linha de Qtd se ela não usar).
- `C100x3` → `{{quantidade}}` = 3.
- Roanne (e os outros 12 tenants) param de receber `📦 Qtd: {{qtd_aleatoria}}`.

## Não está no escopo
- Mexer no trigger `send_whatsapp_on_item_added` (já manda o delta correto).
- Mexer no template de "Solicitação" (primeira mensagem pedindo SIM) — continua vindo de `integration_whatsapp.template_solicitacao`.
- Mexer em outros tipos de template (PAID_ORDER, TRACKING, PRODUCT_CANCELED, etc.).
