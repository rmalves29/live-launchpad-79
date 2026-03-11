

## Plano: Cupom/Brinde no pedido (admin) com persistência no checkout

### O que será feito

1. **Migração SQL** — Adicionar 3 colunas na tabela `orders`:
   - `coupon_code` (text) — código do cupom aplicado
   - `coupon_discount` (numeric, default 0) — valor do desconto
   - `gift_name` (text) — nome do brinde aplicado

2. **ViewOrderDialog.tsx** — Adicionar seção de cupom/brinde abaixo do "Resumo do Pedido":
   - Input + botão "Aplicar" (visível apenas para pedidos **não pagos**)
   - Busca na tabela `coupons` por código + tenant_id → calcula desconto (percentage/fixed/progressive)
   - Se não encontrar, busca na tabela `gifts` por nome + tenant_id → valida valor mínimo
   - Ao aplicar: atualiza `orders.coupon_code`, `coupon_discount`, `gift_name`, `total_amount` e `observation` (tags `[COUPON_DISCOUNT]` / `[BRINDE]`)
   - Incrementa `used_count` do cupom
   - Mostra cupom/brinde já aplicado com botão "Remover"
   - Detecta cupom pré-existente lendo `coupon_code`/`gift_name` do pedido

3. **PublicCheckout.tsx** — Pré-carregar cupom/brinde do pedido:
   - Ao carregar pedidos, verificar se algum tem `coupon_code` ou `gift_name` preenchido
   - Se sim: pré-popular `appliedCoupon` e `couponDiscount` automaticamente
   - Desabilitar campo de cupom (mostrar "Cupom já aplicado pelo vendedor")
   - Desconto já aparece no resumo de valores

### SQL para executar no Supabase

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_name text;
```

### Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `src/components/ViewOrderDialog.tsx` | Campo de cupom/brinde + lógica de aplicar/remover/persistir |
| `src/pages/pedidos/PublicCheckout.tsx` | Ler `coupon_code`/`gift_name` dos pedidos e pré-popular estado |

