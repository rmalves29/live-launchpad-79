## Objetivo

Fazer com que o sistema **ignore completamente** as notificações de cancelamento/estorno enviadas pelos gateways de pagamento. Hoje o pedido já não é cancelado automaticamente, mas o sistema ainda registra alertas em `audit_logs` e `webhook_logs`. Você quer que essas notificações sejam silenciosamente descartadas.

## O que muda

Apenas dois arquivos de Edge Function, sem mudanças no banco e sem mudanças no frontend.

### 1. `supabase/functions/mp-webhook/index.ts` (Mercado Pago)

No bloco onde `payment.status` é `refunded`, `cancelled`, `charged_back` ou `rejected`:
- Em vez de chamar `handleCancelledPayment(...)` (que grava alerta em `webhook_logs` + `audit_logs`), retornar imediatamente `200 OK` com `{ ignored: "cancellation event ignored by policy" }`.
- Manter um único `console.log` curto para rastreio nos logs da função (não vai pro banco).
- A função `markOrderAsCancelled` e o restante do fluxo de pagamento aprovado permanecem intactos.

### 2. `supabase/functions/pagarme-webhook/index.ts` (Pagar.me)

No bloco `isCancelEvent` (que cobre `charge.refunded`, `order.canceled`, `body.status === 'canceled' | 'refunded'`, etc.):
- Retornar imediatamente `200 OK` com `{ ignored: "cancellation event ignored by policy" }` antes de qualquer busca de pedido ou chamada a `markOrderAsCancelled`.
- Manter um `console.log` curto.

### Outros gateways

`infinitepay-webhook` e `sipag-webhook` não tratam cancelamento hoje — nada a fazer. Não existe `appmax-webhook`.

## Resultado

- Webhook de cancelamento/estorno do MP ou Pagar.me → 200 OK imediato, **nenhum** log em `webhook_logs`, **nenhum** registro em `audit_logs`, **nenhuma** alteração no pedido.
- Cancelamento manual pelo painel continua funcionando normalmente.
- Confirmações de pagamento aprovado continuam intocadas.

Confirma que é isso que você quer (descartar 100% silenciosamente, sem nem registrar o alerta)?
