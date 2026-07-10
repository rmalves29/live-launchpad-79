
# Sistema de Notificações Push (Web Push VAPID + PWA)

## Visão geral

Sistema próprio de push notifications usando **VAPID keys** (web-push nativo). Inclui PWA instalável, opt-in ao abrir o checkout, 5 templates automáticos com fallback WhatsApp, disparo manual segmentado e dashboard de relatórios — tudo em uma **nova página dedicada dentro do menu Comunicação**.

---

## 1. Nova página "Push" no menu Comunicação

Rota: **`/comunicacao/push`** (ou nome equivalente ao padrão atual do menu Comunicação).

Adicionar item no `AppSidebar` dentro do grupo Comunicação (ao lado de WhatsApp, Instagram etc.) com ícone `Bell`.

Página com 4 abas internas:

1. **Assinantes** — lista de quem aceitou push (nome, telefone, @instagram, dispositivo, última atividade, ativo/inativo, botão remover). Filtro por status pago/não pago, busca por nome/telefone.
2. **Templates** — 5 cards editáveis (produto no carrinho, produto cancelado, pedido pago, código de rastreio, fila de espera). Cada um com: título, corpo (com variáveis `{nome}`, `{produto}`, `{pedido_numero}`, `{codigo_rastreio}`), imagem opcional, URL de clique e toggle **Ativo/Inativo**. Quando inativo OU cliente sem push → cai no WhatsApp automaticamente.
3. **Nova campanha** — disparo manual: título, corpo, imagem, URL, público (`Todos`, `Só pagos`, `Só não pagos`), preview, botão enviar. Histórico de campanhas abaixo com métricas.
4. **Relatórios** — dashboard próprio: cards (assinantes ativos, enviados 7d/30d, taxa de clique, taxa de falha), gráfico linha de envios por dia, barras por template, tabela de campanhas recentes.

## 2. Infraestrutura Push (VAPID + PWA)

- Gerar VAPID keys e salvar como secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Service Worker `public/push-sw.js` com handlers `push` e `notificationclick`.
- `public/manifest.webmanifest` (ícones 192/512, `display: standalone`, `theme_color`, `start_url`) + tags no `index.html`.
- Registro do SW isolado do preview Lovable (só produção, fora de iframe, hostname não-preview).

## 3. Banco de dados (migration)

Todas com `tenant_id`, RLS + GRANTs padrão:

- **`push_subscriptions`**: `id`, `tenant_id`, `customer_id?`, `endpoint UNIQUE`, `p256dh`, `auth`, `user_agent`, `name`, `phone`, `instagram_handle`, `is_active`, `last_seen_at`, `created_at`
- **`push_templates`**: `id`, `tenant_id`, `type` (enum: `cart_item_added`, `cart_item_removed`, `order_paid`, `tracking_code`, `waitlist`), `title`, `body`, `image_url`, `click_url`, `is_enabled`, `updated_at` — UNIQUE(`tenant_id`, `type`) + trigger seed dos 5 tipos ao criar tenant
- **`push_notifications_log`**: `id`, `tenant_id`, `subscription_id`, `customer_id`, `template_type`, `title`, `body`, `channel` (`push`|`whatsapp_fallback`), `status` (`sent`|`failed`|`clicked`), `error`, `campaign_id?`, `created_at`, `clicked_at`
- **`push_campaigns`**: `id`, `tenant_id`, `title`, `body`, `image_url`, `click_url`, `audience` (`all`|`paid`|`unpaid`), `total_targets`, `total_sent`, `total_failed`, `total_clicked`, `created_by`, `created_at`

## 4. Opt-in no checkout

Componente `PushOptInCard` renderizado **ao abrir `/checkout`**:
- Card acima do resumo: "Receba notificações do seu pedido"
- Campos: nome (pré-preenchido), telefone (pré-preenchido), Instagram (@handle, opcional)
- Botão "Ativar" → `Notification.requestPermission()` → `pushManager.subscribe({userVisibleOnly:true, applicationServerKey: VAPID_PUBLIC_KEY})` → envia para edge `push-subscribe`
- Detecta iOS Safari sem PWA e orienta instalar na tela inicial
- Se já assinado, exibe badge "✓ Notificações ativas"

## 5. Fluxo automático (dispatcher)

Regra em `push-dispatch`:
```
IF template.is_enabled AND cliente tem push_subscription ativa
  → envia web-push, log channel='push'
ELSE
  → dispara pipeline WhatsApp atual, log channel='whatsapp_fallback'
```

Integrado nos 5 gatilhos existentes:
- Trigger `cart_items` INSERT → `cart_item_added`
- Trigger `cart_items` DELETE / cancelamento → `cart_item_removed`
- Webhook pagamento aprovado → `order_paid`
- Update de `orders.tracking_code` → `tracking_code`
- `product_waitlist` retorno de estoque → `waitlist`

## 6. Edge functions (novas)

- `push-subscribe` — persiste assinatura + dados do cliente
- `push-unsubscribe` — desativa assinatura
- `push-dispatch` — decide push vs WhatsApp por template
- `push-send-campaign` — disparo em massa segmentado por público
- `push-track-click` — registra clique
- `push-vapid-public-key` — expõe chave pública ao front

Todas com CORS, validação Zod, retorno 200 `{success:false,error}` em falhas, cleanup automático de endpoints 404/410.

---

## Detalhes técnicos

- Web-push no Deno via `npm:web-push@3` (JWT VAPID + POST FCM/Mozilla).
- Rastreamento de clique: SW chama `push-track-click?log_id=...` antes de abrir URL.
- iOS 16.4+ exige PWA instalado — card detecta e orienta.
- RLS: `push_subscriptions` restrita por tenant; anon insere via edge function (service role).
- Rate-limit em `push-subscribe` (5 endpoints/IP/min) e sanitização de inputs.
- Variáveis nos templates reaproveitam parser de `whatsapp-templates.ts`.
- Skill PWA respeitada: SW só em produção, `NetworkFirst` HTML, `/~oauth` excluído.

## Entregáveis

1. Migration com 4 tabelas + enum + trigger seed + GRANTs + RLS.
2. Service Worker + manifest + registro guardado (produção-only).
3. `PushOptInCard` no checkout.
4. **Nova página `/comunicacao/push`** com 4 abas (Assinantes, Templates, Nova Campanha, Relatórios) + item no `AppSidebar`.
5. 6 edge functions listadas.
6. Integração do dispatcher nos 5 gatilhos automáticos.
7. Secrets VAPID gerados e configurados.
