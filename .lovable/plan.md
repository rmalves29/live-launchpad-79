# Cupom com Condição Mínima + Datas + Desconto Somente em Produtos

## Regra de cálculo (única e inegociável)

```
desconto = round(productsSubtotal * (percentual/100), 2)   // tipo "percentage"
desconto = min(valorFixo, productsSubtotal)                // tipo "fixed"
total    = (productsSubtotal - desconto - outrosDescontos) + frete
```

- `productsSubtotal` = soma de `preço * quantidade` dos itens do carrinho (SEM frete, SEM outros descontos).
- Frete NUNCA entra na base do desconto do cupom.
- Se carrinho mudar e deixar de atender o mínimo → cupom é removido automaticamente.

## 1. Migration SQL (public.coupons)

Adicionar 3 colunas (todas nullable, sem default destrutivo):

- `min_purchase_amount numeric(10,2)` — valor mínimo de produtos para ativar
- `min_items_quantity integer` — quantidade mínima de peças para ativar
- `starts_at timestamptz` — início de validade (`expires_at` já existe)

Constraint: apenas uma das duas (`min_purchase_amount` OU `min_items_quantity`) pode ser preenchida por linha; ambas podem ser NULL.

Sem trigger novo, sem mudança em RLS/grants existentes.

## 2. Admin — `CouponsManager.tsx`

- Campo "Data de Início" (date) → salva `YYYY-MM-DDT00:00:00-03:00`.
- Renomear "Data de Expiração" → "Data de Fim" (date) → salva `YYYY-MM-DDT23:59:59-03:00`.
- Ao editar: converter `starts_at`/`expires_at` aplicando offset `-03:00` para exibir a data correta no input.
- Bloco "Condição mínima" (só aparece para tipo `percentage` e `fixed`):
  - Radio: Nenhuma / Valor mínimo (R$) / Quantidade mínima (peças)
  - Salva no campo correspondente; zera o outro como `null`.
- Listagem: badges "Mín R$ X" ou "Mín N peças" + datas formatadas em Brasília.

## 3. Validação — `useCouponOrGift.ts`

`applyCode(code, productsSubtotal, itemsCount)`:

1. Buscar cupom por código + tenant.
2. Se `starts_at` definido e `now() < starts_at` → rejeita ("Cupom ainda não está válido").
3. Se `expires_at` definido e `now() > expires_at` → rejeita ("Cupom expirado").
4. Se `min_purchase_amount` definido e `productsSubtotal < min_purchase_amount` → rejeita com toast informando o valor faltante.
5. Se `min_items_quantity` definido e `itemsCount < min_items_quantity` → rejeita com toast informando peças faltantes.
6. Cálculo do desconto sempre sobre `productsSubtotal` (nunca soma frete).
7. `AppliedCoupon` ganha `min_purchase_amount` e `min_items_quantity` (read-only) para o checkout re-validar quando o carrinho mudar.

Comparações de data usam `Date.getTime()` (timestamps absolutos — independe do fuso do browser).

## 4. Checkouts — `Checkout.tsx`, `PublicCheckout.tsx`, `Manual.tsx`

- Passar `productsSubtotal` e `itemsCount` para `applyCode`.
- `useEffect` observando o carrinho: se houver cupom aplicado e o carrinho deixar de atender mínimo OU passar de `expires_at` → remover cupom + toast.
- Auditar e garantir que o `discount` do cupom é subtraído apenas de `productsSubtotal` antes de somar o frete (corrigir qualquer ponto que aplique sobre `produtos + frete`).

## 5. Fora de escopo (não muda)

- Cupons progressivos (lógica existente preservada).
- Gateways de pagamento, edge functions, triggers de pedido.
- Cálculo de frete.

## Testes manuais obrigatórios antes de entregar

1. Cupom 10% com mínimo R$ 100, carrinho R$ 99 → bloqueia.
2. Mesmo cupom, carrinho R$ 100 + frete R$ 20 → desconto = R$ 10 (não R$ 12).
3. Cupom R$ 15 fixo com mínimo 10 peças, 9 peças → bloqueia; 10 peças → aplica R$ 15.
4. Cupom criado para 27/05 → válido até 27/05 23:59:59 -03:00; às 28/05 00:00 -03:00 → expirado.
5. Cupom com `starts_at` futuro → bloqueia com mensagem "ainda não está válido".
6. Carrinho atende mínimo, cupom aplicado, usuário remove item → cupom sai automaticamente.
