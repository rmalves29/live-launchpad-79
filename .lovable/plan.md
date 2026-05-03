## Plano: Correção do tracking de entrega Z-API + Relatório de impacto

Dois entregáveis nesta etapa, na ordem:

1. **Relatório imediato (Modo B)** — diagnóstico do estrago histórico antes de mexer em qualquer código.
2. **Correção definitiva** — schema + 8 edge functions + webhook com lookup em 3 níveis.

---

## Parte 1 — Relatório de impacto (executado primeiro, antes de qualquer mudança)

Objetivo: para cada tenant com Z-API ativa, mostrar quantas mensagens das últimas 30 dias estão marcadas como "enviadas" no banco mas **nunca foram confirmadas como entregues** pelo WhatsApp.

Como será gerado:
- Consulta SQL agregada em `whatsapp_messages` cruzando `sent_at`, `delivery_status` e presença de `zapi_message_id`.
- Para uma amostra (até 50 mensagens por tenant das últimas 24h que tenham `zapi_message_id`), chamar `zapi-check-message-status` (Modo A) e comparar status real vs status no banco.
- Saída: tabela por tenant com colunas `total_enviadas`, `sem_zapi_message_id` (órfãs - bug 1), `status_pending_no_banco`, `confirmadas_entregues_amostra`, `nao_entregues_amostra`, `taxa_entrega_real_estimada`.
- Entregue como mensagem no chat + arquivo CSV em `/mnt/documents/relatorio_zapi_entrega.csv`.

Nada é gravado, nada é alterado. Só leitura.

---

## Parte 2 — Correção definitiva

### 2.1 Migration de schema

Adicionar em `whatsapp_messages`:
- `zapi_zaap_id text` — ID interno do Z-API que vem nos webhooks `DeliveryCallback` / `MessageStatusCallback` (campo `zaapId`).
- `zapi_message_id text` — confirmar que existe; se não, criar. É o `messageId` que a Z-API retorna no envio (formato WhatsApp `3EB0...`).
- `delivered_at timestamptz` — quando o webhook confirmou entrega no aparelho.
- `read_at timestamptz` — quando o webhook confirmou leitura.
- Índices: `idx_wm_zaap_id` em `zapi_zaap_id`, `idx_wm_msg_id` em `zapi_message_id`, ambos parciais (`WHERE ... IS NOT NULL`).

### 2.2 Edge functions de envio (8 arquivos)

Padronizar todas para:
1. Capturar do response do Z-API tanto `messageId` quanto `zaapId` (a Z-API retorna os dois no JSON de sucesso).
2. Persistir os dois no `INSERT` em `whatsapp_messages` junto com `delivery_status='sent'` e `sent_at=now()`.
3. Logar o response cru no console para debug futuro.

Arquivos afetados:
- `supabase/functions/zapi-send-message/index.ts` (corrigir o INSERT existente que hoje grava sem IDs)
- `supabase/functions/fe-send-message/index.ts` (hoje grava só em `fe_messages`; adicionar IDs lá também — `fe_messages` precisa das mesmas colunas — incluir na migration)
- `supabase/functions/zapi-broadcast/index.ts`
- `supabase/functions/zapi-send-paid-order/index.ts`
- `supabase/functions/zapi-send-tracking/index.ts`
- `supabase/functions/zapi-send-item-added/index.ts`
- `supabase/functions/zapi-send-confirmation-link/index.ts`
- `supabase/functions/zapi-send-product-canceled/index.ts`

### 2.3 Webhook `zapi-webhook` — lookup em 3 níveis

Quando chegar um callback de status, tentar localizar a mensagem nesta ordem:
1. **Primário**: `WHERE zapi_zaap_id = payload.zaapId` (o que a Z-API realmente referencia nos callbacks).
2. **Fallback**: `WHERE zapi_message_id = payload.messageId` (caso o envio tenha sido feito antes da migration ou o callback venha com formato antigo).
3. **Último recurso**: `WHERE phone = payload.phone AND sent_at BETWEEN now()-interval '10 min' AND now()` ordenado por `sent_at desc limit 1`.

Quando achar:
- Atualizar `delivery_status` (`delivered`/`read`/`failed`).
- Setar `delivered_at` ou `read_at` conforme o evento.
- Se a mensagem não foi achada em nenhum dos 3 níveis, gravar em uma nova tabela `whatsapp_webhook_orphans` para inspeção (raw payload + timestamp).

### 2.4 Validação pós-deploy

- Enviar 1 mensagem de teste pelo `zapi-send-message` no MANIA DE MULHER → confirmar que `zapi_message_id` E `zapi_zaap_id` ficam gravados.
- Aguardar 30s → consultar a row → confirmar que `delivery_status` virou `delivered` (não mais `sent`/`pending`) e que `delivered_at` foi preenchido.
- Rodar de novo o Modo B e mostrar a taxa de entrega "antes vs depois".

---

## O que NÃO está incluído nesta etapa

- Reprocessamento retroativo das mensagens órfãs antigas (não dá para recuperar IDs perdidos).
- Mudanças no fluxo de retry de mensagens não entregues — fica para uma etapa 3 se você quiser.
- Mexer no anti-block delay ou na lógica de envio em si — só observabilidade e tracking.

---

## Ordem de execução após aprovação

1. Rodar Parte 1 e te entregar o CSV + resumo no chat.
2. Aplicar a migration (2.1).
3. Atualizar as 8 edge functions (2.2) — deploy automático.
4. Atualizar o webhook (2.3) — deploy automático.
5. Rodar a validação (2.4) e te mostrar o resultado.

Posso prosseguir?