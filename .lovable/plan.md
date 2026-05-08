
# Corrigir frete e desconto duplicados em pedidos mesclados

## Regra de negócio (definida pelo usuário)

Quando 2+ pedidos são mesclados num único checkout:
- **Frete**: cobrado uma única vez, atribuído **integralmente ao pedido mais antigo** (menor `id`/`created_at`). Os demais ficam com frete = 0.
- **Desconto PIX/cupom**: cada pedido recebe o desconto calculado **sobre o seu próprio subtotal** (mesma fórmula de quando o cliente paga 1 pedido só — ex.: PIX 10% → cada pedido subtrai 10% do seu subtotal de itens).

Resultado: cada pedido fica auto-consistente (`subtotal − desconto_próprio + frete_se_for_o_primeiro = total_amount`) e a soma dos totais reflete o que o cliente realmente pagou (desde que o carrinho não tenha mudado pós-pagamento).

## Bugs atuais

1. **Frete duplicado**: cada pedido grava `[FRETE] R$ X` integral → soma de fretes = N × frete_real.
2. **Desconto PIX duplicado**: cada pedido grava `[PIX_DISCOUNT] R$ Y` com o valor cheio enviado ao gateway (10% do subtotal combinado), em vez de 10% do próprio subtotal.

Exemplo 6430/6508 (subtotais hoje 223,20 e 53,00, frete 25, PIX 10%):
- Hoje: 6430 = 209,53 / 6508 = 39,33 → soma 248,86 ❌
- Correto: 6430 = 223,20 − 22,32 + 25,00 = **225,88** / 6508 = 53,00 − 5,30 + 0 = **47,70** → soma **273,58**

> Observação: o pagamento real do MP foi R$ 262,53 (= 276,20 − 38,67 + 25). A diferença pra R$ 273,58 acontece porque o PIX cobrado pelo gateway foi 10% do subtotal **combinado** (R$ 38,67), enquanto a nova regra calcula 10% por pedido individual (soma = R$ 27,62, R$ 11,05 a menos de desconto). Essa é a consequência intencional da regra escolhida — cada pedido fica igual ao que seria sozinho. Se o usuário quiser que a soma bata exatamente com o gateway, a alternativa seria rateio proporcional (não foi a opção escolhida).

## Mudanças

### 1. `supabase/functions/create-payment/index.ts` (Mercado Pago)

No loop `for (const orderId of orderIds)`:
- Ordenar `orderIds` por `created_at ASC` (ou menor id) antes do loop.
- Para cada pedido:
  - `orderProductsTotal` = soma dos `cart_items` desse pedido.
  - `pixShare` = `round2(orderProductsTotal × pix_discount_percent)` (usar o **percentual** configurado, não o valor absoluto enviado ao gateway).
  - `couponShare` = aplicar mesma lógica do cupom (% ou valor fixo rateado proporcionalmente — confirmar regra atual do cupom).
  - `freightForThisOrder` = frete total **só** se for o primeiro pedido da lista; senão `0`.
  - Gravar `[FRETE]` somente no 1º pedido; nos demais, omitir ou gravar `R$ 0,00`.
  - Gravar `[PIX_DISCOUNT] R$ pixShare` por pedido.
  - `total_amount = max(0, orderProductsTotal − pixShare − couponShare) + freightForThisOrder`.

### 2. `supabase/functions/create-infinitepay-payment/index.ts`

Mesma lógica.

### 3. Trigger `validate_order_total_on_payment`

Continua válida — recalcula a partir do que está em `[FRETE]`, `[PIX_DISCOUNT]`, `[COUPON_DISCOUNT]` na observação. Como passamos a gravar valores corretos por pedido, a trigger naturalmente valida o valor certo. Sem mudança.

### 4. Backfill dos pedidos mesclados antigos

Script SQL (preview antes de aplicar):

```text
1. Identificar grupos: orders agrupadas por payment_link onde COUNT(*) > 1
2. Para cada grupo:
   a. Ordenar por created_at ASC
   b. Extrair frete_total (frete da 1ª linha [FRETE] de qualquer pedido — todos têm o mesmo)
   c. Extrair pix_percent: detectar via pix_discount / subtotal_combinado (ex.: 38,67 / 386,70 = 10%)
      — se não for possível detectar (carrinho mudou), usar config do tenant (`integration_*.pix_discount_percent`)
   d. Para cada pedido do grupo:
      - novo_pix = round2(subtotal_proprio × pix_percent)
      - novo_frete = frete_total se for o 1º, senão 0
      - novo_total = max(0, subtotal_proprio − novo_pix − novo_coupon) + novo_frete
      - reescrever linhas [FRETE] e [PIX_DISCOUNT] na observation
      - UPDATE orders SET total_amount = novo_total, observation = nova_obs
3. Apresentar lista (id, antes, depois, delta) ao usuário antes de gravar
```

Pedidos 6430/6508 entrarão automaticamente nessa varredura. Resultado esperado:
- 6430: total_amount 209,53 → **225,88**, observation com `[FRETE] R$ 25,00` e `[PIX_DISCOUNT] R$ 22,32`
- 6508: total_amount 39,33 → **47,70**, observation **sem [FRETE]** (ou R$ 0,00) e `[PIX_DISCOUNT] R$ 5,30`

## Validação pós-implementação

- Conferir que cada pedido satisfaz `total_amount = subtotal − pix − coupon + frete_proprio`.
- Conferir que dentro do grupo: `SUM(frete_proprio) = frete_unico_do_gateway`.
- Simular novo checkout com 2 pedidos no preview e validar que o gateway recebe um único `shipping` e descontos corretos.

## Fora de escopo

- Não mexer em pedidos individuais (sem merge) — já estão corretos.
- Não alterar UI do checkout nem cálculo do desconto enviado ao gateway (continua 10% × subtotal combinado, que é o que o cliente vê e paga).
