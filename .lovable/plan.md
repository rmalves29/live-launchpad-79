# Rateio proporcional do desconto PIX/cupom em pedidos mesclados

## Problema

Quando o checkout mescla 2+ pedidos (ex.: 6430 + 6508), o backend grava o **valor cheio** do `pix_discount` em **cada** pedido, em vez de ratear proporcionalmente ao subtotal de cada um. Resultado: a soma dos `[PIX_DISCOUNT]` é o dobro/triplo do desconto realmente concedido pelo gateway, e o `total_amount` de cada pedido fica abaixo do correto.

Exemplo (6430/6508): desconto real cobrado pelo MP = R$ 38,67. Hoje cada pedido carrega "−38,67", total combinado dos pedidos R$ 248,86, quando o correto seria R$ 287,53.

## Solução

### 1. `supabase/functions/create-payment/index.ts` (Mercado Pago)
No loop `for (const orderId of orderIds)` (linhas ~270–340):
- Antes do loop, calcular `productsTotalAllOrders` somando os `cart_items` de **todos** os `orderIds`.
- Dentro do loop, para cada pedido:
  - calcular `orderProductsTotal` (subtotal só desse pedido);
  - `share = orderProductsTotal / productsTotalAllOrders` (se total > 0);
  - `pixShare = round2(pix_discount_total * share)` e `couponShare = round2(coupon_discount_total * share)`;
  - aplicar **ajuste de resto** no último pedido para que a soma bata exatamente com o total (evita arredondamento perdendo/sobrando 1 centavo);
  - gravar `[PIX_DISCOUNT] R$ pixShare` e `[COUPON_DISCOUNT] R$ couponShare` na observação;
  - `total_amount = max(0, orderProductsTotal − pixShare − couponShare) + freteDesseObjeto` (frete continua por pedido, igual hoje).
- Frete por pedido permanece como está.

### 2. `supabase/functions/create-infinitepay-payment/index.ts`
Aplicar exatamente a mesma lógica de rateio (o arquivo tem o mesmo loop, linhas ~140–200).

### 3. (opcional, defesa) `validate_order_total_on_payment` trigger
Continua válida — ela recalcula `total_amount` a partir do que está em `[PIX_DISCOUNT]`/`[COUPON_DISCOUNT]` na observação. Como agora gravamos o valor já rateado, o trigger naturalmente passa a validar o valor correto. Sem mudança necessária.

### 4. Correção dos pedidos já afetados
Rodar uma varredura SQL para identificar e corrigir pedidos antigos com merge cujo `[PIX_DISCOUNT]` foi duplicado:

- **Critério de detecção**: agrupar `orders` por `payment_link` (mesmo link compartilhado = merge) e verificar onde a soma dos `[PIX_DISCOUNT]` extraídos da observação > desconto real esperado (10% × subtotal combinado).
- Para cada grupo afetado:
  - recalcular `pixShare` e `couponShare` por pedido (mesma fórmula acima);
  - reescrever a linha `[PIX_DISCOUNT]` da observação;
  - atualizar `total_amount`.
- Apresentar lista de pedidos antes de executar (preview), depois aplicar via tool de insert/update.
- Pedidos 6430 e 6508 já confirmados como afetados — corrigir para:
  - 6430: PIX_DISCOUNT = R$ 31,26 → total = 223,20 − 31,26 + 25,00 = **R$ 216,94**
  - 6508: PIX_DISCOUNT = R$ 7,42 → total = 53,00 − 7,42 + 25,00 = **R$ 70,58**
  - (rateio: 38,67 × 223,20/276,20 e 38,67 × 53,00/276,20)

## Validação

- Após mudança, simular no preview um checkout mesclando 2 pedidos e conferir que:
  - soma dos `[PIX_DISCOUNT]` nos pedidos = desconto enviado ao gateway;
  - soma dos `total_amount` = (subtotal combinado − desconto) + soma dos fretes.
- Conferir logs de `create-payment` (linha de override do PIX) para garantir que o `resolved.value` único está sendo dividido corretamente.

## Fora de escopo

- Não alterar a UI do checkout nem o cálculo do desconto em si (continua 10% × subtotal combinado).
- Não mexer em pedidos individuais (sem merge) — eles já estão corretos.
