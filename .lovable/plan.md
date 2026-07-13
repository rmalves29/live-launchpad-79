## Fase 1 — Estabilização (P0)

Antes de mexer em qualquer trigger de pedido pago, quero **confirmar 3 pontos** com você, porque cada um afeta pedidos reais em produção:

### 1. Trigger `process_paid_order` (o mais crítico — bloqueia o banco por ~5s)
Hoje o `UPDATE orders SET is_paid=true` dispara uma chamada HTTP **síncrona** dentro do trigger (Bling, WhatsApp de rastreio, etc). Vou:
- Trocar por `net.http_post` (pg_net) → fire-and-forget assíncrono.
- Criar tabela `paid_order_dispatch_log` para rastrear cada disparo (id, status, retry_count, last_error).
- Manter idempotência: se já houve dispatch com sucesso para o `order_id`, não redispara.

**Efeito colateral esperado:** o pedido é marcado como pago **instantaneamente**, mas o envio ao Bling / WhatsApp acontece 1–3s depois (em vez de travar a resposta HTTP do webhook).

### 2. Idempotência de webhooks de pagamento
Adicionar coluna `external_event_id` (unique) em `webhook_logs` para bloquear reprocessamento de eventos duplicados vindos de Pagar.me / Mercado Pago / Appmax.

### 3. RLS + Índices pendentes da auditoria de segurança
- `cron_logs_backups`, `webhook_logs_backups`, `storage_file_references` → habilitar RLS (somente service_role).
- `push_subscriptions`, `push_campaigns`, `push_notifications_log` → restringir policies ao tenant do usuário.
- `cart_items` → remover SELECT anônimo global; permitir apenas por `cart_id` do próprio visitante.
- `whatsapp_messages` → remover INSERT anônimo.
- Índices compostos: `orders(tenant_id, is_paid, created_at DESC)`, `fe_group_events(tenant_id, created_at DESC)`, `webhook_logs(tenant_id, created_at DESC)`.

### 4. Bateria de testes (após aplicar)
- Deno tests nas edge functions críticas: `bling-sync-orders`, `pagarme-subscription-webhook`, `push-send-campaign`, `create-infinitepay-payment`.
- Query manual: marcar pedido de teste como pago e medir tempo do `UPDATE` (esperado <100ms).
- Verificar via `edge_function_logs` que o dispatch assíncrono completou.
- Rodar `supabase--linter` para confirmar que RLS foi corrigido sem regressão.
- Fumar o checkout público (`/t/:slug`) para garantir que RLS de `cart_items` não quebrou o carrinho anônimo.

---

### Confirmações que preciso antes de iniciar

1. **Posso mover o dispatch do trigger para async?** Isso muda a semântica: o webhook responde em 200ms, mas o Bling recebe o pedido 1–3s depois. Se algum código do frontend depende do Bling já estar sincronizado imediatamente após marcar como pago, precisamos ajustar.
2. **Janela de manutenção:** posso executar agora (impacto ~30s de indisponibilidade parcial nos triggers durante o `CREATE OR REPLACE`)?
3. **Cart público:** posso restringir `cart_items` a leitura por `cart_id` (via cookie/sessionid), quebrando qualquer script que hoje leia carrinhos alheios? (é o comportamento correto, só quero confirmação)

Se responder "pode tudo" eu sigo direto.
