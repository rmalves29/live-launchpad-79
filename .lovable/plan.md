## Objetivo

Quando um item for adicionado ao carrinho, a mensagem do WhatsApp será enviada com:

1. **Botão clicável "Pagar Agora"** (igual cobrança em massa — CTA e link editáveis pelo lojista).
2. **Novas variáveis no template** para mostrar os produtos já no pedido, o total acumulado e o número do pedido.

Resultado visual esperado:

```text
Pedido #8404
Seus itens:
• Anel Aliança Dupla (C287/20) — 1x R$ 65,00
• Brinco Pérola (C112) — 2x R$ 45,00

Total: R$ 155,00

[ 🔗 Pagar Agora ]
```

## Mudanças

### 1. Banco de dados
- Adicionar em `integration_whatsapp`:
  - `item_added_button_enabled` boolean default `true`
  - `item_added_button_label` text default `'Pagar Agora'`
  - `item_added_button_url` text nullable (vazio = usa checkout do tenant)
- Atualizar trigger `send_whatsapp_on_item_added` para enviar também o `cart_id` no payload.

### 2. Novas variáveis do template `ITEM_ADDED`
Na edge function `zapi-send-item-added`, o `formatMessage` passa a entender:

- `{{itens_pedido}}` → lista formatada de todos os itens do carrinho:
  ```
  • Nome do Produto (CÓDIGO) — Qtdx R$ 00,00
  ```
- `{{total_pedido}}` → soma `qty * unit_price` formatada `R$ 0,00`.
- `{{numero_pedido}}` → id mais recente em `orders` para o `cart_id`. Vazio remove a linha.

As variáveis antigas (`{{produto}}`, `{{quantidade}}`, `{{valor}}`, `{{codigo}}`, `{{link_checkout}}`) **continuam funcionando**.

### 3. Template padrão atualizado
Novo conteúdo padrão do template ITEM_ADDED:
```
Pedido #{{numero_pedido}}
Seus itens:
{{itens_pedido}}

Total: {{total_pedido}}
```

### 4. UI (`src/components/WhatsAppSettings.tsx`)
Abaixo do toggle "Enviar mensagem de item adicionado":
- Switch "Enviar com botão clicável (Pagar Agora)"
- Input "Texto do botão" (máx. 20 caracteres)
- Input "Link do botão" (vazio = checkout do tenant)
- Legenda com as variáveis disponíveis.

### 5. Edge function `zapi-send-item-added`
- Carregar as 3 colunas novas.
- Buscar `cart_items` (+ produtos) e `orders` pelo `cart_id`.
- Aplicar as novas variáveis no `formatMessage`.
- Se botão habilitado → chamar `/send-button-actions` (mesmo payload da cobrança em massa) com `buttonActions: [{ id:'1', type:'URL', url, label }]`.
- Se desligado → mantém `/send-text` atual.
- Fluxo de consentimento (SIM/aguardando) permanece intacto.

## O que NÃO entra
- Mudança no fluxo de consentimento.
- Botão em outras mensagens automáticas (pago, cancelado, etc.).
