## Objetivo
Evoluir o cadastro de cupom para suportar:
1. **Condição mínima** (escolher um): valor mínimo do pedido (R$) OU quantidade mínima de peças.
2. **Janela de validade**: data de início e data de fim. O fim é sempre **23:59:59 de Brasília (-03:00)** do dia escolhido — após esse instante o cupom fica automaticamente inativo.
3. **Aplicação restrita a produtos**: o desconto **nunca** incide sobre o frete; vale só sobre o subtotal de produtos (regra já é assim no cálculo atual, mas será documentada/garantida).

Vale para cupons `percentage` e `fixed`. Progressivo segue como hoje (sem regra de mínimo nova).

## Mudanças no banco (SQL para rodar no Supabase SQL Editor)

```sql
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS min_purchase_amount numeric,
  ADD COLUMN IF NOT EXISTS min_items_quantity  integer,
  ADD COLUMN IF NOT EXISTS starts_at           timestamptz;

COMMENT ON COLUMN public.coupons.min_purchase_amount IS 'Valor mínimo do subtotal de produtos (R$) para ativar o cupom. NULL = sem mínimo.';
COMMENT ON COLUMN public.coupons.min_items_quantity  IS 'Quantidade mínima de peças no carrinho para ativar o cupom. NULL = sem mínimo.';
COMMENT ON COLUMN public.coupons.starts_at           IS 'Data/hora de início da validade do cupom (UTC). NULL = válido desde já.';
COMMENT ON COLUMN public.coupons.expires_at          IS 'Data/hora de expiração (UTC). Para "fim do dia X em Brasília", gravar X 23:59:59-03:00.';
```

`expires_at` já existe — só passa a ser preenchido sempre com `YYYY-MM-DDT23:59:59-03:00` quando o admin escolher uma data fim.

## Mudanças no admin — `src/components/CouponsManager.tsx`
- Renomear o campo atual “Data de Expiração” para **“Data de Fim”** e adicionar **“Data de Início”** (ambos `<input type="date">`).
- Ao salvar:
  - `starts_at = <data início>T00:00:00-03:00` (ou `null`).
  - `expires_at = <data fim>T23:59:59-03:00` (ou `null`).
- Ao editar: extrair a parte `YYYY-MM-DD` aplicando o offset -03:00 (usar helper de `src/lib/date-utils.ts`).
- Quando o tipo for `percentage` ou `fixed`, novo bloco **“Condição mínima”** com:
  - Seletor: `Nenhuma` | `Valor mínimo (R$)` | `Quantidade mínima de peças`.
  - Campo numérico correspondente. Salva em `min_purchase_amount` **ou** `min_items_quantity` (o outro fica `null`).
- Listagem: mostrar “Início: dd/mm/aaaa”, “Fim: dd/mm/aaaa 23:59 (Brasília)”, “Mín. R$ X” ou “Mín. N peças”.
- Texto auxiliar no formulário: *“O cupom incide apenas sobre o valor dos produtos; o frete não é descontado.”*

## Mudanças na validação — `src/hooks/useCouponOrGift.ts`
- Ampliar `applyCode(productsTotal, itemsCount)`.
- Após carregar o cupom:
  - **Janela de validade**: rejeitar se `now() < starts_at` (“Cupom ainda não está válido. Começa em …”) ou `now() > expires_at` (“Cupom expirado em …”).
  - **Mínimo de valor**: se `min_purchase_amount` definido e `productsTotal < min_purchase_amount` → toast “Faltam R$ Y para usar este cupom”.
  - **Mínimo de peças**: se `min_items_quantity` definido e `itemsCount < min_items_quantity` → toast “Faltam M peças para usar este cupom”.
- Reforçar nos comentários que `productsTotal` é o subtotal de produtos (não inclui frete) — base do desconto.
- Atualizar interface `AppliedCoupon` com os novos campos.

## Garantia “cupom não incide no frete”
Auditar cada local que aplica o desconto para confirmar que o cálculo é sempre `desconto sobre subtotal de produtos` e o total final é `subtotal − pix_discount − coupon_discount + frete`:
- `src/pages/pedidos/Checkout.tsx`
- `src/pages/pedidos/PublicCheckout.tsx`
- `src/pages/pedidos/Manual.tsx`
- `src/hooks/useCouponOrGift.ts` (cálculo base já usa `productsTotal`)

Se algum cálculo aplicar percentual sobre `(produtos + frete)`, corrigir para usar somente `produtos`. Passar `itemsCount` (soma dos `qty`) para `applyCode` nestes 3 checkouts.

Tabela `audit_logs`/`orders` não muda.

## Detalhes técnicos
- Fuso: usar helpers de `src/lib/date-utils.ts` para montar/exibir `-03:00`; nunca usar `new Date(dateStr)` direto sem offset.
- `src/integrations/supabase/types.ts` regenera automaticamente após o SQL.
- Sem mudanças em edge functions, gateways de pagamento ou triggers.

## Entrega
1. SQL acima (1 bloco) para você rodar no SQL Editor.
2. Edição do `CouponsManager.tsx`, `useCouponOrGift.ts` e dos 3 checkouts.
