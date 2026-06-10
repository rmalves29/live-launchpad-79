## Objetivo

Quando um item for adicionado ao carrinho, a mensagem do WhatsApp será enviada com:

1. **Botão clicável "Pagar Agora"** (igual cobrança em massa — CTA e link editáveis pelo lojista).
2. **Novas variáveis no template** para mostrar os produtos já no pedido, o total acumulado e o número do pedido.

Resultado visual esperado (igual ao print enviado):

```text
Pedido #8404
Seus itens:
• Anel Aliança Dupla (C287/20) — 1x R$ 65,00
• Brinco Pérola (C112) — 2x R$ 45,00

Total: R$ 155,00

[ 🔗 Pagar Agora ]
```

## Mudanças

### 1. Banco de dados (migration)
Adicionar 3 colunas em `integration_whatsapp`:

- `item_added_button_enabled` boolean default `true`
- `item_added_button_label` text default `'Pagar Agora'` (máx. 20 chars — limite WhatsApp)
- `item_added_button_url` text nullable (vazio = usa o checkout do tenant automaticamente)

### 2. Novas variáveis do template `ITEM_ADDED`
Na edge function `zapi-send-item-added`, o `formatMessage` passa a entender:

- `{{itens_pedido}}` → lista formatada de todos os itens do `cart_id` atual:
  ```
  • Nome do Produto (CÓDIGO) — Qtdx R$ 00,00
  • Nome do Produto (CÓDIGO) — Qtdx R$ 00,00
  ```
- `{{total_pedido}}` → soma de `qty * unit_price` de todos os itens do carrinho, formatada `R$ 0,00`.
- `{{numero_pedido}}` → número do pedido vinculado ao `cart_id` (busca em `orders` pelo `cart_id`, retorna o id mais recente). Se não houver pedido ainda, retorna vazio e a linha é removida.

As variáveis antigas (`{{produto}}`, `{{quantidade}}`, `{{valor}}`, `{{codigo}}`, `{{link_checkout}}`) **continuam funcionando** — nada quebra.

Implementação: antes de chamar `formatMessage`, buscar:
```ts
// produtos do carrinho
supabase.from('cart_items').select('qty, unit_price, products(name, code)').eq('cart_id', cartId)
// número do pedido
supabase.from('orders').select('id').eq('cart_id', cartId).order('id', { desc: true }).limit(1)
```

Como o trigger atual passa apenas `tenant_id`, `customer_phone`, `product_*`, `quantity`, `unit_price`, vou estender o payload do trigger SQL `send_whatsapp_on_item_added` para incluir `cart_id` (já disponível em `NEW.cart_id`).

### 3. Template padrão atualizado
Atualizar o template ITEM_ADDED padrão (e oferecer um "Restaurar padrão" no UI) para usar o novo formato:

```
Pedido #{{numero_pedido}}
Seus itens:
{{itens_pedido}}

Total: {{total_pedido}}
```

Linhas com variável vazia (ex.: pedido ainda não criado) são removidas automaticamente, mantendo a regra atual do `formatMessage`.

### 4. UI de configuração (`src/components/WhatsAppSettings.tsx`)
Abaixo do toggle "Enviar mensagem de item adicionado":

- Switch "Enviar com botão clicável (Pagar Agora)"
- Input "Texto do botão" (máx. 20 caracteres, padrão `Pagar Agora`)
- Input "Link do botão" (placeholder com o checkout padrão; vazio = usa checkout do tenant)
- Pequena legenda listando as novas variáveis disponíveis: `{{itens_pedido}}`, `{{total_pedido}}`, `{{numero_pedido}}` + as antigas.

### 5. Edge function `zapi-send-item-added`
- Carregar as 3 colunas novas em `getZAPICredentials`.
- Carregar itens do carrinho + número do pedido a partir de `cart_id`.
- Aplicar as novas variáveis no `formatMessage`.
- Se botão habilitado → chamar `/send-button-actions` (mesmo payload da cobrança em massa) em vez de `/send-text`, com `buttonActions: [{ id:'1', type:'URL', url, label }]`.
- Se desligado → mantém comportamento atual (texto puro com `{{link_checkout}}`).
- Fluxo de consentimento (awaiting/silenced/active) permanece intacto — botão só substitui o canal de envio da mensagem final.

## O que NÃO entra

- Mudança no fluxo de consentimento (SIM/aguardando) — continua igual.
- Aplicar o mesmo botão em outras mensagens automáticas (pago, cancelado, etc.) — fica para um próximo passo se quiser.
