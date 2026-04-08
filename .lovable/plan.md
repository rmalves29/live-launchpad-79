

# Plano: Usar preço promocional automaticamente nos pedidos

## Problema
Quando um produto tem `promotional_price` cadastrado, o sistema ignora esse valor e sempre usa o `price` (preço original) como `unit_price` nos itens do carrinho. Isso faz com que pedidos de produtos em promoção sejam criados com o valor cheio.

## Solução
Em todos os pontos onde `unit_price` é definido ao adicionar/atualizar itens no carrinho, aplicar a lógica:

```text
preço efetivo = promotional_price > 0 ? promotional_price : price
```

## Arquivos a alterar

### Frontend (3 arquivos)
1. **`src/pages/pedidos/Live.tsx`** — Pedidos via Live: trocar `product.price` por `product.promotional_price || product.price` nas linhas 591 e 607
2. **`src/pages/pedidos/Manual.tsx`** — Pedidos manuais: mesma troca nas linhas 352 e ~375
3. **`src/components/EditOrderDialog.tsx`** — Edição de pedido: nas linhas 209 e 222, usar `selectedProduct.promotional_price || selectedProduct.price` como fallback (mantendo `unitPrice` quando informado manualmente)

### Edge Functions (2 arquivos)
4. **`supabase/functions/zapi-webhook/index.ts`** — Pedidos via WhatsApp: linhas 1345 e 1416
5. **`supabase/functions/instagram-webhook/index.ts`** — Pedidos via Instagram: linhas 367 e 816

## Lógica aplicada
Em cada ponto, a substituição segue o padrão:
```
// Antes
unit_price: product.price

// Depois  
unit_price: (product.promotional_price && product.promotional_price > 0) ? product.promotional_price : product.price
```

## Impacto
- Produtos sem preço promocional continuam usando o preço normal (sem breaking change)
- Produtos com promoção passam a usar automaticamente o valor com desconto
- Nenhuma alteração de banco de dados necessária

