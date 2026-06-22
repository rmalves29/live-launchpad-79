## Objetivo
Permitir que o cliente da OrderZap assine os planos **Pro (semestral)** e **Enterprise (anual)** com **cobrança recorrente real no cartão de crédito** via API de Subscriptions da Pagar.me. A cada cobrança aprovada, o sistema **identifica automaticamente o tenant que pagou e estende `subscription_ends_at` na tabela `tenants`** (+6 ou +12 meses). O plano Basic (mensal) continua como está.

## Como o sistema sabe qual empresa pagou
Em cada subscription criada na Pagar.me serão gravados dois campos de identificação redundantes (a prova de qualquer falha):
1. **`code`** = `orderzap-sub-<TENANT_ID>-<PLAN_ID>` (campo nativo, único por tenant+plano).
2. **`metadata`** = `{ tenant_id, plan_id, interval_months }` (Pagar.me devolve nos webhooks).

Além disso, gravamos localmente em `subscription_recurrences` o vínculo `pagarme_subscription_id → tenant_id`. Quando o webhook chega:
- Tenta resolver o tenant por: `metadata.tenant_id` → `subscription_recurrences.pagarme_subscription_id` → parsing do `code`.
- Se nenhum resolver, registra em `webhook_logs` como `unmatched_subscription` (sem atualizar nada — evita atualizar tenant errado).

## Como vai funcionar (visão do usuário)
1. Na tela **Renovar Assinatura**, os cards Pro e Enterprise ganham um botão extra **"Assinar com renovação automática (cartão)"**.
2. Modal pede dados do cartão + CPF/nome/endereço do titular. Cartão é tokenizado no navegador com a public key (chave secreta nunca sai do servidor).
3. Backend cria customer + card + subscription na Pagar.me com `interval=month`, `interval_count=6` ou `12`, `billing_type=prepaid`, gravando `code` e `metadata` com o `tenant_id`.
4. Webhook da Pagar.me confirma cada cobrança e o sistema:
   - Localiza o tenant pelo metadata/code/registro local.
   - Soma `+6` ou `+12` meses em `tenants.subscription_ends_at` (a partir da data atual ou da data já futura, o que for maior).
   - Atualiza `subscription_recurrences.current_period_end`, `last_charge_at`, `last_charge_status`.
   - Grava tudo em `webhook_logs` com o `tenant_id` para auditoria.
5. Usuário vê na tela o status da assinatura ativa (próxima cobrança, cartão usado) e pode cancelar a renovação automática a qualquer momento.

## Configuração necessária (3 secrets)
- **`PAGARME_ORDERZAP_API_KEY`** — Secret Key `sk_...` da conta Pagar.me da OrderZap (exclusiva para mensalidades).
- **`PAGARME_ORDERZAP_PUBLIC_KEY`** — Public Key `pk_...` (usada no navegador para tokenizar).
- **`PAGARME_WEBHOOK_SECRET_ORDERZAP`** — para validar HMAC dos webhooks.

## Mudanças no banco
Nova tabela **`subscription_recurrences`**:
- `tenant_id` (FK lógica para `tenants.id`, único junto com `plan_id`)
- `plan_id` (`pro` | `enterprise`), `interval_months` (6 ou 12), `price`
- `pagarme_subscription_id` (único), `pagarme_customer_id`, `pagarme_card_id`, `pagarme_code`
- `status` (`active` | `canceled` | `past_due` | `pending`)
- `current_period_end`, `last_charge_at`, `last_charge_status`, `cancel_at`, `canceled_at`
- `card_brand`, `card_last4` (para mostrar na UI)
- RLS: tenant_admin vê/cancela só os seus; service_role acesso total; super_admin vê todos.
- GRANTs explícitos + trigger `updated_at`.

## Edge Functions (3 novas)
1. **`pagarme-create-subscription`**
   - Entrada: `tenant_id`, `plan_id`, `card_token`, dados do titular.
   - Valida que o usuário logado pertence ao `tenant_id`.
   - Cria customer + card + subscription na Pagar.me com `code` e `metadata` carregando o `tenant_id`.
   - Grava em `subscription_recurrences` e estende `subscription_ends_at` já no primeiro pagamento aprovado retornado pela API.

2. **`pagarme-subscription-webhook`** (pública)
   - Valida HMAC com `PAGARME_WEBHOOK_SECRET_ORDERZAP`.
   - Eventos tratados:
     - `charge.paid` / `invoice.paid` → resolve tenant, **estende `subscription_ends_at` em +6 ou +12 meses** (com base no `interval_months` salvo), atualiza `current_period_end`.
     - `charge.payment_failed` → marca `past_due` (mantém acesso até o `subscription_ends_at` atual).
     - `subscription.canceled` → marca `canceled`.
   - Registra tudo em `webhook_logs` com `tenant_id` resolvido.

3. **`pagarme-cancel-subscription`**
   - Cancela na Pagar.me e marca `cancel_at = current_period_end` (acesso vai até o fim do ciclo pago).

## Frontend
- **`src/pages/RenovarAssinatura.tsx`** — adicionar botão "Assinar com renovação automática" nos cards Pro/Enterprise; bloco mostrando assinatura ativa (cartão final, próxima cobrança, botão cancelar).
- **`src/components/billing/PagarmeSubscribeDialog.tsx`** (novo) — modal com formulário do cartão + titular, carrega Pagar.me JS v5 com a public key, tokeniza, chama a edge function.
- Tela `/assinatura/recorrente/sucesso` simples reaproveitando layout existente.

## Fora de escopo
- Plano Basic (mensal) continua via Mercado Pago.
- Checkout das lojas (Pagar.me por tenant em `integration_pagarme`) não sofre alteração — chaves totalmente separadas.
- Preços especiais da Ju Bijoux continuam aplicados também na recorrência.

## Sequência
1. Migration `subscription_recurrences` + GRANTs + RLS + trigger.
2. Pedir as 3 secrets via `add_secret`.
3. Criar as 3 edge functions.
4. Componente do modal + ajustes em `RenovarAssinatura.tsx`.
5. URL do webhook para cadastrar no painel Pagar.me (entrego pronta pra colar).

## Detalhes técnicos
- Endpoint: `https://api.pagar.me/core/v5/subscriptions` (Basic Auth `sk_xxx:`).
- Recorrência: `interval: "month"`, `interval_count: 6|12`, `billing_type: "prepaid"`, `pricing_scheme: { price: <centavos> }`, `payment_method: "credit_card"`.
- `code` único por tenant+plano evita duplicar subscription se o usuário clicar 2x.
- Webhook idempotente: usa `charge.id` para não somar dias duas vezes da mesma cobrança.