

# Botão "Adicionar ao Carrinho" na Vitrine `/t/:slug` — versão simplificada

## Ajustes desta versão

1. Modal de identificação na 1ª vez pede **somente @Instagram + WhatsApp**.
2. Se o produto estiver **sem estoque**, o botão "Adicionar ao carrinho" é substituído por **"Esgotado"** (desabilitado), e o seletor de quantidade fica oculto.

## Fluxo

```text
[Card produto — com estoque]        [Card produto — sem estoque]
  imagem                              imagem (com selo "Esgotado")
  C123 — Nome                         C124 — Nome
  R$ 49,90                            R$ 39,90
  ───────────────                     ───────────────
  [-] [ 1 ] [+]                       (sem seletor)
  [ 🛒  Adicionar ao carrinho ]       [   Esgotado   ]  (cinza, disabled)

       ↓ (1ª vez no navegador / 1º acesso desse IP)
┌──────────────────────────────┐
│  Identifique-se p/ comprar   │
│  @Instagram: [____________]  │
│  WhatsApp:   [____________]  │
│  [  Confirmar e adicionar ]  │
└──────────────────────────────┘
       ↓
  ✅ "Produto adicionado!
     Confira no seu WhatsApp ✨"
```

## Identificação persistente (3 camadas)

| Origem | Conteúdo | Quando |
|---|---|---|
| `localStorage` | `phone`, `instagram` | Mesmo navegador |
| Tabela `storefront_visitors` | `tenant_id`, `ip_hash`, `customer_phone` | Outro dispositivo, mesmo IP |
| Modal | — | Quando nada acima resolve |

## Backend

**Nova tabela**

```sql
CREATE TABLE public.storefront_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ip_hash text NOT NULL,
  customer_id bigint,
  customer_phone text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ip_hash)
);
ALTER TABLE public.storefront_visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.storefront_visitors
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant_view_own" ON public.storefront_visitors
  FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());
```

**Novas Edge Functions** (service role, vitrine é anônima):

- `storefront-resolve-visitor` — recebe `tenant_slug`, hasheia o IP da request, devolve `{ phone, instagram }` se existir.
- `storefront-add-to-cart` — recebe `tenant_slug`, `product_id`, `qty`, `customer_phone`, `customer_instagram`. Resolve cliente (cria se não existir, atualiza Instagram se vazio), garante pedido aberto **LIVE / hoje / `is_paid=false`**, valida estoque atomicamente (rejeita se `stock <= 0` ou `stock < qty`), faz upsert em `cart_items` com snapshot (`product_name`, `product_code`, `product_image_url`, preço promocional), recalcula `total_amount` e atualiza `storefront_visitors`.

A mensagem **"item adicionado"** continua disparada pelo trigger `send_whatsapp_on_item_added` ao inserir em `cart_items` — sem chamada extra.

## Frontend

- `src/pages/TenantStorefront.tsx`
  - Carrega também `stock` na query de produtos.
  - `const isOutOfStock = (product.stock ?? 0) <= 0;`
  - Card sem estoque: badge **"Esgotado"** sobre a imagem (substitui a badge "Promoção"), oculta seletor `[-]/[+]`, botão renderizado como **"Esgotado"** com `variant="secondary"` e `disabled`.
  - Card com estoque: estado `quantities[productId]`, controles `[-] [n] [+]` (limite máximo = `stock`) e botão **"Adicionar ao carrinho"** com loading.
  - Ao montar: lê `localStorage.storefront_identity_<slug>`; se vazio, chama `storefront-resolve-visitor`.
  - No clique: se sem identidade, abre modal; senão chama `storefront-add-to-cart` direto.
  - Erro de estoque vindo da função → toast vermelho + recarrega o produto (atualiza para "Esgotado" se for o caso).
- `src/components/storefront/IdentifyCustomerDialog.tsx` (novo)
  - Apenas dois inputs: `@Instagram` e `WhatsApp`.
  - Validação: telefone brasileiro válido + sanitização do `@` e espaços.
  - Salva em `localStorage` no sucesso.

## Regras importantes

- **Imutabilidade pago**: só anexa em pedido com `is_paid=false`; se o do dia já foi pago, cria novo.
- **Estoque atômico**: mesma proteção do `Live.tsx` (read fresh + `update().gt('stock', 0)` + rollback). Se outro cliente esgotou entre a renderização e o clique, a função recusa com mensagem amigável.
- **Cliente bloqueado**: recusa com erro amigável.
- **Snapshot de produto** em `cart_items` conforme regra existente.
- **CORS** padrão do projeto nas duas funções.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/<ts>_storefront_visitors.sql` | Novo |
| `supabase/functions/storefront-resolve-visitor/index.ts` | Novo |
| `supabase/functions/storefront-add-to-cart/index.ts` | Novo |
| `src/pages/TenantStorefront.tsx` | Botão + qty + badge "Esgotado" + integração |
| `src/components/storefront/IdentifyCustomerDialog.tsx` | Novo (só @ + telefone) |

