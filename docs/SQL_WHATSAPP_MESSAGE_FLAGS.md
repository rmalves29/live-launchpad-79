# SQL: Flags para Controle de Mensagens Automáticas WhatsApp

Execute o seguinte SQL no Supabase para adicionar as flags de controle de mensagens automáticas:

```sql
-- Adicionar flags para controlar envio de mensagens automáticas do WhatsApp
ALTER TABLE integration_whatsapp 
ADD COLUMN IF NOT EXISTS send_item_added_msg BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS send_paid_order_msg BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS send_product_canceled_msg BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS send_out_of_stock_msg BOOLEAN NOT NULL DEFAULT true;

-- Adicionar comentários explicativos
COMMENT ON COLUMN integration_whatsapp.send_item_added_msg IS 'Enviar mensagem quando item for adicionado ao carrinho';
COMMENT ON COLUMN integration_whatsapp.send_paid_order_msg IS 'Enviar mensagem quando pagamento for confirmado';
COMMENT ON COLUMN integration_whatsapp.send_product_canceled_msg IS 'Enviar mensagem quando produto for cancelado do pedido';
COMMENT ON COLUMN integration_whatsapp.send_out_of_stock_msg IS 'Enviar mensagem quando produto estiver esgotado';
```

## Descrição das Flags

| Flag | Descrição | Padrão |
|------|-----------|--------|
| `send_item_added_msg` | Controla o envio da mensagem quando um item é adicionado ao carrinho do cliente | `true` |
| `send_paid_order_msg` | Controla o envio da mensagem de confirmação de pagamento | `true` |
| `send_product_canceled_msg` | Controla o envio da mensagem quando um produto é cancelado do pedido | `true` |
| `send_out_of_stock_msg` | Controla o envio da mensagem quando um produto está esgotado | `true` |

## Onde Configurar

As flags podem ser ativadas/desativadas em:
- **Configurações > Integrações > Z-API WhatsApp**
