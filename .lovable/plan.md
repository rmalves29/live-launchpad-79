

## Plano: Sistema "Fluxo de Envio" - Gerenciamento de Grupos WhatsApp

Este é um módulo complexo com múltiplas funcionalidades. Proponho uma implementação faseada.

### Visão Geral da Arquitetura

```text
┌─────────────────────────────────────────────┐
│              Fluxo de Envio                 │
│  /fluxo-envio (rota principal)              │
├─────────┬──────────┬──────────┬─────────────┤
│ Grupos  │Campanhas │ Envios   │ Relatórios  │
│  (tab)  │  (tab)   │  (tab)   │   (tab)     │
└─────────┴──────────┴──────────┴─────────────┘
```

### Fase 1 - Tabelas no Supabase (6 migrações)

1. **`fe_groups`** - Grupos gerenciados
   - `id`, `tenant_id`, `group_id` (WhatsApp JID), `group_name`, `invite_link`, `participant_count`, `max_participants`, `is_entry_open` (controle de entrada), `is_active`, timestamps

2. **`fe_campaigns`** - Campanhas (agrupamento de grupos)
   - `id`, `tenant_id`, `name`, `slug` (link único), `is_entry_open`, `is_active`, `description`, timestamps

3. **`fe_campaign_groups`** - Relação campanha ↔ grupos
   - `id`, `campaign_id`, `group_id`, `sort_order`, timestamps

4. **`fe_messages`** - Mensagens enviadas/agendadas
   - `id`, `tenant_id`, `campaign_id` (nullable), `group_id` (nullable), `content_type` (text/image/audio/video), `content_text`, `media_url`, `status` (pending/sent/failed), `scheduled_at`, `sent_at`, timestamps

5. **`fe_link_clicks`** - Rastreamento de clicks nos links de campanha
   - `id`, `campaign_id`, `ip_hash`, `user_agent`, `clicked_at`

6. **`fe_group_events`** - Entrada/saída de pessoas
   - `id`, `tenant_id`, `group_id`, `phone`, `event_type` (join/leave), `created_at`

7. **`fe_auto_messages`** - Mensagens automáticas de entrada/saída
   - `id`, `tenant_id`, `group_id` (nullable = aplica a todos), `event_type` (join/leave), `content_type`, `content_text`, `media_url`, `is_active`, timestamps

RLS: todas com `tenant_id = get_current_tenant_id() OR is_super_admin()` + `service_role` full access.

### Fase 2 - Frontend (4 arquivos principais)

1. **`src/pages/fluxo-envio/Index.tsx`** - Página principal com 4 abas (Tabs):
   - **Grupos**: Lista grupos, botão "Buscar do WhatsApp" (via Z-API `list-groups`), toggle entrada aberta/fechada, link de convite
   - **Campanhas**: CRUD de campanhas, associar grupos, link público de entrada, toggle habilitar/desabilitar entrada
   - **Envios**: Compor mensagem (texto/imagem/audio/video), selecionar grupos ou campanha, envio imediato ou agendado (date picker + time)
   - **Relatórios**: Clicks por campanha, entradas/saídas por grupo, gráfico temporal

2. **`src/components/fluxo-envio/GroupsManager.tsx`** - CRUD de grupos
3. **`src/components/fluxo-envio/CampaignsManager.tsx`** - CRUD de campanhas com balanceamento
4. **`src/components/fluxo-envio/MessageComposer.tsx`** - Compositor de mensagens com upload de mídia

### Fase 3 - Edge Functions (3 funções)

1. **`fe-send-message`** - Envia mensagem (texto/imagem/audio/video) para grupos via Z-API
2. **`fe-campaign-redirect`** - Rota pública que recebe click do link de campanha, registra click, balanceia e redireciona ao grupo com menos participantes (que tenha entrada aberta)
3. **`fe-process-scheduled`** - Processa mensagens agendadas (cron job)

### Fase 4 - Rota e Navegação

- Rota `/fluxo-envio` no `App.tsx`
- Item "Fluxo de Envio" na `Navbar.tsx`
- Visibilidade restrita: `tenant.slug === 'app'` (Mania de Mulher) ou `isSuperAdmin`

### Fase 5 - Webhook de eventos de grupo

- Estender `zapi-webhook/index.ts` para capturar eventos de entrada/saída de grupo e gravar em `fe_group_events`
- Disparar mensagens automáticas configuradas em `fe_auto_messages`

### Detalhes do Balanceamento de Campanhas

Quando alguém clica no link de uma campanha (`/t/fluxo/{campaign_slug}`):
1. Busca todos os grupos da campanha com `is_entry_open = true`
2. Ordena por `participant_count ASC`
3. Redireciona para o `invite_link` do grupo com menos participantes
4. Registra o click em `fe_link_clicks`

### Restrição de Acesso

No `Navbar.tsx` e `App.tsx`, o módulo só aparece se:
```typescript
const showFluxoEnvio = tenant?.slug === 'app' || isSuperAdmin;
```

### Estimativa

Este é um módulo grande. Recomendo implementar em etapas:
1. Primeiro: tabelas + página com aba Grupos (funcional)
2. Segundo: Campanhas + link de balanceamento
3. Terceiro: Envios com agendamento
4. Quarto: Relatórios + mensagens automáticas

Posso começar pela etapa 1?

