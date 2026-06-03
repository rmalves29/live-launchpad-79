## Problema (caso pedido #7713 — Roanne Joias)

A cliente não pagou pelo link do MP (PIX), fez transferência direta para a empresa, o admin marcou o pedido como **pago manualmente**. Depois, o MP enviou um webhook de cancelamento/estorno referente à preferência original e a função `markOrderAsCancelled` reverteu automaticamente o pagamento manual (`is_paid: true → false`, `is_cancelled: true`). Foi necessário re-marcar o pedido manualmente como pago.

Audit log confirma: `auto_cancel_payment_refunded` em 28/mai 18:46, `previous_is_paid: true`.

## Mudança

Remover o auto-cancelamento de pedidos quando o webhook do gateway sinaliza estorno/cancelamento. Substituir por **apenas registrar um alerta** (audit_log + webhook_log) para o admin decidir se cancela manualmente pela interface.

## Arquivos afetados

### 1. `supabase/functions/mp-webhook/index.ts`
- Função `markOrderAsCancelled` (linhas ~493-536): remover o `UPDATE orders SET is_paid=false, is_cancelled=true`.
- Manter apenas a inserção em `audit_logs` (action passa a ser `payment_refund_alert`) e `webhook_logs` (`webhook_type: mercadopago_payment_cancelled_alert`), incluindo no meta `previous_is_paid` e `previous_is_cancelled` para histórico.
- Renomear a função para `logPaymentCancelAlert` para deixar claro que não muda estado.
- Atualizar os call sites (loop em ~linha 240-260) para continuar chamando, mas sem efeito de cancelamento.

### 2. `supabase/functions/pagarme-webhook/index.ts`
- Mesma mudança no bloco de cancelamento (linhas ~367-415): remover o `UPDATE` que seta `is_paid=false, is_cancelled=true`, manter o registro em `audit_logs` como alerta.

### 3. Sem migration de banco
Nenhuma alteração de schema. Apenas comportamento de edge functions.

## Resultado esperado

- Pedidos marcados como pagos manualmente (ou via outro fluxo) **nunca mais serão automaticamente revertidos** por webhooks de estorno/cancelamento do MP ou Pagar.me.
- O admin continua podendo cancelar manualmente pela tela de pedidos quando necessário.
- Todo evento de estorno do gateway fica registrado em `audit_logs` (`action: payment_refund_alert`) e `webhook_logs` para auditoria.

## Memória a atualizar

Substituir a memória `mem://regras-negocio/cancelamento-automatico-por-estorno` para refletir a nova regra: "Webhooks de estorno/cancelamento NÃO alteram o pedido — apenas registram alerta em audit_logs/webhook_logs. Cancelamento é sempre manual."