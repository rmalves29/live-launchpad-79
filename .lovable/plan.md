## Problema

Hoje o campo configurado no painel do Pagar.me (`max_installments_without_interest`) **não tem efeito nenhum** no checkout:

- Em `supabase/functions/create-payment/index.ts` (`buildInstallmentsConfig`, linhas 95-137), o loop é fixo de 1 até 12, e os dois ramos do `if/else` empurram exatamente o mesmo objeto. O Pagar.me recebe a lista completa 1x-12x e mostra todas.

Você quer travar para que o cliente não escolha mais que 4 parcelas (ou o número configurado no painel).

## Solução

Adicionar um campo novo `max_installments` na tabela `integration_pagarme` que define o **teto** de parcelas exibidas no checkout, e usá-lo de fato no payload enviado ao Pagar.me.

### 1. Banco

Migration:
- `ALTER TABLE public.integration_pagarme ADD COLUMN max_installments integer NOT NULL DEFAULT 12 CHECK (max_installments BETWEEN 1 AND 12);`

### 2. Painel — `src/components/integrations/PagarMeIntegration.tsx`

- Adicionar `max_installments` no tipo, no `formData` (default 4) e na carga inicial a partir de `integration`.
- Novo input numérico **"Máximo de parcelas (1 a 12)"** ao lado do "Parcelas sem juros", com `min=1 max=12`.
- Incluir `max_installments` no payload do `upsert` do `handleSave`.
- Mostrar o valor no resumo do cartão da integração.

### 3. Edge function — `supabase/functions/create-payment/index.ts`

- No `.select(...)` do `integration_pagarme` (linha ~502) incluir `max_installments`.
- Em `buildInstallmentsConfig`, aceitar novo parâmetro `maxInstallments` e usar `Math.min(12, maxInstallments || 12)` como teto do loop.
- Passar `pagarmeIntegration.max_installments` na chamada (linha ~910).
- Limitar também o `installments: 1..N` no caso de `applyPaymentMethodLock` (Pagar.me usa `accepted_payment_methods` mas o array `installments` é o que controla o select do checkout).

### 4. Validação

Após o deploy, abrir o painel, definir `max_installments = 4`, gerar um link de pagamento Pagar.me de teste e confirmar que o checkout só mostra 1x-4x. Conferir log do `create-payment` para ver o payload com `installments` truncado.

## Observações

- O campo `max_installments_without_interest` continua existindo e mantém seu papel de "até quantas são sem juros" (a partir daí o Pagar.me aplica os juros configurados na conta).
- Nada muda nos webhooks nem em outras integrações.
