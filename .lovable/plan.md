# Ativar/desativar PIX e Cartão por gateway

## Diagnóstico

As colunas `enable_pix` e `enable_credit_card` **já existem** nas tabelas `integration_mp`, `integration_pagarme`, `integration_appmax` e `integration_infinitepay`. O problema **não é SQL** — é que ninguém lê esses campos:

1. As telas de configuração dos 4 gateways não têm switch para esses campos.
2. O `Checkout.tsx` e `PublicCheckout.tsx` mostram PIX e Cartão fixos, sem consultar essas flags.
3. As edge functions de pagamento não validam se o método escolhido está habilitado.

## O que será feito

### 1. UI de configuração (4 telas)
Adicionar 2 switches em cada uma:
- `src/components/integrations/PagarMeIntegration.tsx`
- `src/components/integrations/AppmaxIntegration.tsx`
- `src/components/integrations/InfinitePayIntegration.tsx`
- E no card do Mercado Pago dentro de `src/components/integrations/PaymentIntegrations.tsx`

Switches:
- "Aceitar PIX no checkout"
- "Aceitar Cartão de Crédito no checkout"

Regra de proteção: não permitir desativar os dois ao mesmo tempo (toast de erro).
Se PIX desativado, o campo "% desconto PIX" fica desabilitado.

### 2. Checkout (cliente)
Em `src/pages/pedidos/Checkout.tsx` e `src/pages/pedidos/PublicCheckout.tsx`:
- Carregar `enable_pix` / `enable_credit_card` do gateway ativo do tenant.
- Ocultar o botão/aba PIX quando `enable_pix = false`.
- Ocultar o botão/aba Cartão quando `enable_credit_card = false`.
- Se só um estiver ativo, já seleciona automaticamente.

### 3. Edge functions de pagamento (defesa em profundidade)
Em `create-payment` (MP), `pagarme-webhook`/criação Pagar.me, criação Appmax e `create-infinitepay-payment`:
- Antes de chamar o gateway, ler a flag correspondente do tenant.
- Se método solicitado estiver desativado, retornar `200 OK` com `{success: false, error: "Método de pagamento não disponível"}` (padrão do projeto).

### 4. Sem migração
Nenhuma alteração de schema é necessária — todas as colunas já existem.

## Validação
- Desativar PIX no Pagar.me de um tenant teste → checkout mostra só Cartão.
- Desativar Cartão no MP de outro tenant → checkout mostra só PIX e o lock continua funcionando.
- Tentar desativar os dois → bloqueado com toast.

## Arquivos tocados
- `src/components/integrations/PagarMeIntegration.tsx`
- `src/components/integrations/AppmaxIntegration.tsx`
- `src/components/integrations/InfinitePayIntegration.tsx`
- `src/components/integrations/PaymentIntegrations.tsx` (card do MP)
- `src/pages/pedidos/Checkout.tsx`
- `src/pages/pedidos/PublicCheckout.tsx`
- `supabase/functions/create-payment/index.ts`
- `supabase/functions/create-infinitepay-payment/index.ts`
- Edge functions de criação Pagar.me e Appmax (localizar e ajustar)
