# Plano: WhatsApp API Oficial + Z-API (modo híbrido coordenado)

## Arquitetura

**Z-API = sempre conectada** (leitora e coordenadora):
- Continua lendo grupos, mensagens recebidas, webhooks de clientes
- Continua disparando mensagens em **grupos** (API oficial não permite grupos)
- É a "central" que recebe e interpreta tudo

**API Oficial Meta = canal de envio alternativo** para mensagens 1:1 (cliente):
- Confirmação de pagamento, rastreio, cobrança, mensagem em massa para clientes
- Decide na hora: dentro de 24h → texto livre / fora de 24h → template aprovado
- Nunca usada para grupos

**Roteamento por tipo de mensagem:**
```
Mensagem recebida de grupo/cliente  → Z-API (leitura)
Resposta automática a cliente       → Router decide (oficial se preferência=oficial, senão Z-API)
Envio para grupo WhatsApp           → Sempre Z-API
Confirmação pagamento, rastreio, MM → Router decide (oficial ou Z-API)
```

## Banco de Dados (1 migration)

**Nova tabela `integration_whatsapp_official`** (por tenant):
- `phone_number_id`, `waba_id`, `access_token`, `app_id`
- `webhook_verify_token`, `display_phone_number`, `verified_name`
- `business_account_status`, `is_active`, timestamps
- RLS por tenant + grants para authenticated/service_role

**`tenants`**: nova coluna `whatsapp_provider` (`'zapi' | 'official'`, default `'zapi'`)
- Esta flag controla APENAS o canal de **envio 1:1**. Z-API continua sempre ligada para leitura/grupos.

**`whatsapp_templates`**: novas colunas
- `official_template_name`, `official_status` (`not_submitted`/`pending`/`approved`/`rejected`)
- `official_category`, `official_language` (default `pt_BR`)
- `official_rejection_reason`, `official_components` (jsonb), `official_variables` (jsonb)

## Edge Functions (4 novas)

1. **`whatsapp-router`** — núcleo do roteamento
   - Recebe `{ tenant_id, phone, message_type, payload }`
   - Se `message_type='group'` → força Z-API
   - Senão lê `tenants.whatsapp_provider`:
     - `zapi` → chama `zapi-send-message`
     - `official` → verifica janela 24h em `whatsapp_messages` (última msg recebida do cliente)
       - Dentro de 24h → envia texto livre via oficial
       - Fora → busca template aprovado correspondente, envia como HSM
       - Sem template aprovado → fallback Z-API + log de aviso

2. **`whatsapp-official-send`** — POST `graph.facebook.com/v21.0/{phone_number_id}/messages` com Bearer token do tenant

3. **`whatsapp-official-webhook`** — endpoint público
   - GET: valida `hub.verify_token`
   - POST: persiste status de entrega/leitura e mensagens recebidas em `whatsapp_messages` (atualiza janela 24h)

4. **`whatsapp-official-templates`** — CRUD/submit/sync
   - `submit_all_pending`: botão "Aprovar mensagens existentes" (envia em lote para Meta)
   - `sync_status`: consulta status atual na Meta

## Refatoração dos pontos de envio

Substituir chamadas diretas a `zapi-send-message` por `whatsapp-router` em:
- Trigger `process_paid_order` (confirmação de pagamento)
- Trigger `send_tracking_whatsapp_on_update` (rastreio)
- `fe-send-message` (sendflow → mantém Z-API se for grupo)
- Cobrança, mensagem em massa

`zapi-receive-webhook` (leitura) **não muda** — Z-API continua sendo a fonte única de entrada.

## UI

1. **Nova aba "API Oficial Meta"** em integrações WhatsApp:
   - Formulário: `phone_number_id`, `waba_id`, `access_token`, `app_id`
   - URL do webhook (copiar) + `verify_token` gerado
   - Botão "Testar conexão" + status (`display_phone_number`, `verified_name`)
   - Toggle global: **"Canal de envio 1:1: Z-API / API Oficial"** com aviso explícito:
     > "A Z-API permanece sempre conectada lendo grupos e mensagens. Esta escolha afeta apenas o envio de mensagens individuais para clientes."

2. **Nova aba "Templates Oficiais"** em `src/pages/whatsapp/Templates.tsx`:
   - Lista templates com `official_status`
   - Botão **"Aprovar mensagens existentes"** — envia todos `not_submitted`/`rejected` para Meta em lote
   - Categoria (utility/marketing/authentication) por template
   - Sync de status individual

## Segurança

- `access_token` da Meta armazenado por tenant na tabela `integration_whatsapp_official` (RLS estrita)
- Secrets globais: `META_APP_SECRET` (assinatura de webhook), `META_GRAPH_VERSION` (default `v21.0`)

## Pontos confirmados

- Z-API permanece **sempre ligada** (leitora + grupos + fallback)
- API oficial é canal **adicional** para envios 1:1
- Janela 24h da Meta respeitada automaticamente
- Grupos: sempre Z-API (API oficial não suporta)
- Provedor: Meta Cloud API direto
- Escopo: global por tenant
- Templates: submissão à Meta com botão de aprovação em lote

Posso prosseguir com a implementação?