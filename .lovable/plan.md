## Problema

No modal **Editar Pedido**, ao tentar adicionar o produto **C00003 — PRESENTE | ESPELHO DE COURO** (FL Semi Joias), nada acontece visivelmente. Investigação:

- O produto tem `price = 0,00` e `promotional_price = NULL` (é um "presente").
- No `EditOrderDialog.addProductToOrder`, o `effectiveUnitPrice` cai para **0**.
- A linha entra no `cart_items` com `unit_price = 0`, o `updateOrderTotal` recalcula e o total continua igual.
- Resultado para a usuária: aparenta que "nada aconteceu", e o presente fica solto no pedido sem passar pelas regras de presentes.

## Objetivo

Bloquear o caminho confuso e dar feedback claro à usuária: produtos com preço 0 (presentes) **não devem ser adicionados pelo Editar Pedido**, e sim pelo gerenciador de Presentes.

## Mudanças

### `src/components/EditOrderDialog.tsx`

1. **Seleção do produto (`onValueChange` do Select de Produto)**  
   Quando o produto escolhido tiver `price === 0` e `promotional_price` vazio:
   - Manter `selectedProduct` setado (para mostrar o nome) mas **não** zerar `unitPrice` silenciosamente.
   - Exibir um aviso inline abaixo do Select: *"Este é um presente (R$ 0,00). Adicione pelo gerenciador de Presentes."*

2. **`addProductToOrder` — validação no início**  
   Antes da checagem de estoque, se `selectedProduct.price === 0` e `unitPrice === 0`:
   - `toast({ title: 'Produto é um presente', description: 'Produtos com preço R$ 0,00 devem ser adicionados pelo gerenciador de Presentes, não pelo Editar Pedido.', variant: 'destructive' })`.
   - `return` (não insere nada).

3. **Filtro do dropdown (opcional, mais limpo)**  
   No `filteredProducts`, esconder por padrão produtos com `price = 0`. Adicionar um checkbox/toggle pequeno *"Mostrar presentes"* caso o usuário realmente queira escolher um — útil para diagnóstico, mas presentes ficam fora da rota de venda comum.

### Sem mudanças em backend / DB

Não há trigger nem constraint a alterar. A correção é toda de UX no frontend.

## Fora de escopo

- Reescrever a lógica de Presentes / Gifts.
- Mudar o fluxo de checkout.
- Os erros antigos `bigint NaN` no log do banco não estão ligados a esse caso (vinham de outra rota); se reaparecerem, abro investigação separada.

## Resultado esperado

A usuária da FL Semi Joias, ao escolher C00003 no Editar Pedido, recebe imediatamente um toast vermelho explicando que é presente e onde adicionar, em vez de um clique sem efeito visível.
