## Objetivo

Diferenciar **"mensagem aceita pela Z-API"** de **"mensagem entregue no WhatsApp"** sem risco — apenas leitura na Z-API e leitura no banco. Nenhum schema é alterado, nenhum trigger é tocado, nenhuma mensagem é enviada.

Isto cobre exatamente o teste técnico que você pediu: enviar para um número e depois consultar o status real pelo `messageId`.

---

## O que será criado

### 1. Edge function `zapi-check-message-status` (nova, isolada)

Endpoint para auditoria pontual ou em lote. Aceita 3 modos:

**Modo A — Por messageId específico** (seu teste técnico controlado):
```json
POST /zapi-check-message-status
{ "tenant_id": "...", "message_id": "3EB086A02370BA484D89F5" }
```
Retorna o status real consultado direto na Z-API:
```json
{
  "message_id": "3EB086A02370BA484D89F5",
  "phone": "557599986869",
  "zapi_accepted": true,
  "zapi_status": "SENT",          // SENT | RECEIVED | READ | PLAYED
  "delivered": false,
  "read": false,
  "moment_sent": "...",
  "moment_delivered": null,
  "moment_read": null,
  "raw": { ...resposta crua da Z-API... }
}
```

**Modo B — Auditoria das últimas N horas** (relatório):
```json
POST /zapi-check-message-status
{ "tenant_id": "...", "hours": 24, "limit": 200 }
```
Para cada mensagem com `zapi_message_id` no período, consulta a Z-API e devolve um resumo:
```json
{
  "total_checked": 200,
  "accepted_only": 125,    // Z-API aceitou mas WhatsApp NUNCA confirmou entrega
  "delivered": 60,
  "read": 12,
  "rejected_by_whatsapp": 3,
  "details": [ ... ]
}
```

**Modo C — Por telefone + intervalo** (debug do seu número):
```json
{ "tenant_id": "...", "phone": "5575...", "hours": 1 }
```

### 2. Como ela funciona internamente

- Lê credenciais de `integration_whatsapp` (mesmo padrão do `fe-send-message` e `zapi-broadcast`).
- Chama `GET https://api.z-api.io/instances/{instanceId}/token/{token}/message-status/{messageId}` com header `Client-Token`.
- Interpreta o retorno da Z-API:
  - `status: "SENT"` + sem `momment` de delivered → **Aceito mas não entregue**
  - `status: "RECEIVED"` → **Entregue no aparelho**
  - `status: "READ"` / `"PLAYED"` → **Lido**
  - Erro / `notification: "rejected"` → **Rejeitado pelo WhatsApp**
- **Nada é gravado no banco.** Apenas leitura e resposta JSON.

### 3. Endpoint chamável de duas formas

- Via `supabase.functions.invoke('zapi-check-message-status', { body: {...} })` no frontend (futuro) ou
- Via curl direto pelo Supabase (que é como faremos o teste agora).

---

## O que NÃO será feito nesta etapa

- Nenhuma migração de banco (sem novas colunas `zaap_id`, `delivered_at`, etc.)
- Nenhuma mudança no `zapi-webhook` (continua igual, com o bug de ID mismatch)
- Nenhuma mudança no `fe-send-message`, `zapi-broadcast`, `zapi-send-paid-order`, `zapi-send-tracking`
- Nenhum trigger novo
- Nenhum status atualizado em `whatsapp_messages` ou `fe_messages`

Essa etapa é estritamente **observabilidade**. Depois que ela rodar e confirmarmos a discrepância, voltamos para discutir o Passo 2 (corrigir o webhook) e Passo 3 (migração).

---

## Plano de teste após implementação

1. Você me dá um número de teste (o seu).
2. Eu chamo `fe-send-message` ou `zapi-send-message` para enviar uma mensagem qualquer e capturo o `messageId` retornado.
3. Aguardo ~30s.
4. Chamo `zapi-check-message-status` com esse `messageId`.
5. Te mostro lado a lado: o que o sistema gravou (provavelmente "sent") vs o que a Z-API realmente diz (`SENT` puro = não entregue, ou `RECEIVED` = entregue).
6. Em seguida rodo o Modo B nas últimas 24h e te entrego o número exato de mensagens que estão "sent" no banco mas nunca foram entregues no WhatsApp.

---

## Detalhes técnicos

- Arquivo: `supabase/functions/zapi-check-message-status/index.ts`
- Config: adicionar `[functions.zapi-check-message-status] verify_jwt = false` em `supabase/config.toml` (mesmo padrão das outras zapi-*)
- Usa `SUPABASE_SERVICE_ROLE_KEY` apenas para ler `integration_whatsapp` e `whatsapp_messages` (Modos B e C). Nenhuma escrita.
- Validação de input com checagem manual (tenant_id obrigatório; um de message_id/phone/hours obrigatório).
- CORS padrão do projeto.
- Timeout por requisição à Z-API: 8s. Em modo lote, máximo 200 mensagens por chamada com delay de 200ms entre cada para não estourar rate limit.
- Logs estruturados para acompanhar pelo painel de Edge Functions.

Posso prosseguir?