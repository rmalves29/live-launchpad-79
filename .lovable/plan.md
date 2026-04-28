## Problema

Ao clicar em **Pix** (ou qualquer outro método) no checkout do InfinitePay, aparece o modal "Algo deu errado". O backend está OK — o link é gerado normalmente. O erro acontece **dentro do checkout hospedado da InfinitePay** ao tentar criar a transação.

## Causa raiz

Em `supabase/functions/create-infinitepay-payment/index.ts` o payload enviado para `https://api.checkout.infinitepay.io/links` tem dois problemas que a InfinitePay aceita silenciosamente na criação do link, mas rejeita na hora de processar o pagamento:

1. **E-mail inválido (`@checkout.local`)** — quando o cliente não informa e-mail, fazemos fallback para `${phone}@checkout.local`. A InfinitePay valida o domínio na hora do pagamento e bloqueia a transação.
2. **CPF não é enviado no objeto `customer`** — a InfinitePay exige CPF do pagador para Pix (e para cartão acima de certos valores). Hoje o `body.customerData.cpf` chega na função mas não é repassado.
3. **Valor mínimo R$ 1,00** — para cartão, a InfinitePay rejeita valores abaixo de ~R$ 2,00. Para Pix funciona, mas vale validar.

## O que fazer

### 1. Corrigir `create-infinitepay-payment/index.ts`

- **Remover o fallback `@checkout.local`**. Se o cliente não tem e-mail real, simplesmente **omitir** o campo `email` do objeto `customer` (a InfinitePay aceita customer sem e-mail).
- **Incluir o CPF** no objeto `customer` (campo `tax_id` ou `document`, conforme a API aceita) quando `body.customerData.cpf` estiver preenchido.
- **Logar a resposta completa** da InfinitePay quando `infRes.ok` for `false` ou quando o link gerado for usado e falhar — hoje só logamos em erro 4xx/5xx; a InfinitePay retorna 200 mesmo com link "viciado".

### 2. Validações no checkout (frontend)

- Tornar o **e-mail obrigatório** quando a integração ativa for InfinitePay (ou pelo menos avisar o cliente que sem e-mail real o pagamento pode falhar).
- Tornar o **CPF obrigatório** para Pix via InfinitePay.

### 3. Testar com handle real

Após o deploy, testar novamente com:
- Valor mínimo de R$ 5,00 (acima do limite de cartão)
- E-mail real do cliente preenchido
- CPF preenchido

Se ainda falhar, capturar o `payment_check` da InfinitePay (a função `infinitepay-webhook` já tem essa chamada) para ver o motivo exato da recusa.

## Arquivos afetados

- `supabase/functions/create-infinitepay-payment/index.ts` — ajustar payload `customer` (remover e-mail fake, adicionar CPF, melhorar logs)
- `src/pages/Checkout.tsx` (ou componente de checkout do storefront) — validar e-mail/CPF obrigatórios quando InfinitePay estiver ativo

## Riscos

- Nenhum. As mudanças são aditivas (mais validação) e corrigem um bug que afeta 100% dos pagamentos via InfinitePay sem e-mail real.
