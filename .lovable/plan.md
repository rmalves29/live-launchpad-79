# Plano: Promoção BOGO + Categorias + Seleção em Massa

## 1. Banco de dados (migração)

**`product_categories`** — categorias por tenant
- `id`, `tenant_id`, `name`, `slug`, `is_active`, `created_at`
- RLS isolando por tenant
- Index único em `(tenant_id, slug)`

**`products`** — nova coluna
- `category_id uuid` (FK opcional para `product_categories`)

**`product_promotions`** — regra BOGO da categoria
- `id`, `tenant_id`, `name`, `category_id`
- `buy_qty int` (ex: 1), `get_qty int` (ex: 1)
- `discount_percent int` (default 100 = grátis)
- `starts_at`, `ends_at`, `is_active`
- RLS por tenant

## 2. UI Admin

### Página `/produtos` — seleção em massa
- **Checkbox individual** em cada linha da tabela
- **Checkbox no cabeçalho** ("selecionar todos da página filtrada")
- Filtros existentes (nome, status) continuam funcionando — seleção respeita o filtro ativo
- **Barra sticky de ações em massa** (aparece quando 1+ selecionados):
  - "X produtos selecionados"
  - Botão **"Atribuir categoria → [dropdown]"**
  - Botão **"Remover categoria"**
  - Botão "Limpar seleção"
- Modal de confirmação: "Atribuir categoria 'Promo' a 47 produtos?"
- Atualização em lote via `.update().in('id', [...])`
- Log em `audit_logs` (1 entrada por produto, ação `category_changed`)

### Nova aba `/produtos` → "Categorias"
- CRUD simples: criar, editar nome, ativar/desativar
- Contador de produtos por categoria

### Nova rota `/produtos/promocoes`
- Listar promoções BOGO ativas
- Modal de criação: nome, categoria, compra X, ganha Y, % desconto, período
- Toggle ativar/desativar

### Indicador visual
- Coluna "Categoria" na lista de produtos
- Badge "🎁 BOGO" nos produtos cuja categoria tem promoção ativa

## 3. Backend — cálculo BOGO

Nova edge function **`apply-bogo-promotions`**:
1. Recebe itens do carrinho + tenant_id
2. Busca promoções ativas (data válida, `is_active`)
3. Para cada promoção:
   - Filtra itens cuja `category_id` bate
   - Expande em unidades individuais
   - Ordena por preço DESC
   - Agrupa de `(buy_qty + get_qty)` em `(buy_qty + get_qty)`
   - Aplica desconto nas `get_qty` unidades **mais baratas** de cada grupo
4. Retorna `{ bogo_discount: number, affected_items: [...] }`

Integração no checkout (na ordem):
```
subtotal → BOGO → PIX → Cupom → + frete = total
```

## 4. Integração com gateways

Distribuição proporcional do desconto BOGO igual ao cupom atual em:
- Pagar.me, Appmax, Mercado Pago, InfinitePay
- Tag `[BOGO_DISCOUNT: R$ X]` em `orders.observation`
- Trigger `validate_order_total_on_payment` atualizado para considerar BOGO

## 5. Storefront

- Badge "🎁 Compre 1 Ganhe 1" no card do produto elegível
- Linha "Desconto promoção: -R$ X" no resumo do carrinho
- Tooltip explicando a regra

## 6. Compatibilidade

- Pedidos pagos permanecem imutáveis
- Estoque é debitado também das unidades grátis
- Cancelamento restaura estoque normalmente
- Sync Bling: item gratuito vai com `desconto: 100%`

## Fora de escopo

- Combinação cupom + BOGO no mesmo pedido (BOGO tem prioridade)
- BOGO específico por SKU (só por categoria)
- BOGO condicionado a cliente recorrente

## Ordem de entrega

1. Migração (categorias + coluna + promoções)
2. CRUD de categorias
3. **Seleção em massa em `/produtos`** (checkbox + barra de ações)
4. CRUD de promoções BOGO
5. Função de cálculo + integração no checkout
6. Atualização do trigger de validação de total
7. Distribuição nos 4 gateways
8. Badges no storefront
