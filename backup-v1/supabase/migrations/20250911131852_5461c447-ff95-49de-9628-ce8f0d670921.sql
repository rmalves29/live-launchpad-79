-- Insert default WhatsApp templates using existing enum values
INSERT INTO whatsapp_templates (tenant_id, type, title, content) 
VALUES 
  -- Item Added Template
  (NULL, 'ITEM_ADDED', 'Item Adicionado ao Pedido', '🛒 *Item adicionado ao pedido*

✅ {{produto}} {{codigo}}
Qtd: *{{quantidade}}*
Preço: *{{preco}}*

💰 Subtotal: *{{total}}*

Digite outros códigos para adicionar mais itens ou responda "finalizar" para concluir seu pedido!'),

  -- Product Canceled Template
  (NULL, 'PRODUCT_CANCELED', 'Produto Cancelado', '❌ *Item removido do pedido*

{{produto}}
Qtd: *{{quantidade}}*
Valor: *{{valor}}*

O item foi removido do seu carrinho.
Continue comprando ou digite "finalizar" para ver o total! 🛍️'),

  -- Paid Order Template  
  (NULL, 'PAID_ORDER', 'Pedido Pago', '🎉 *Pagamento Confirmado - Pedido #{{order_id}}*

Seu pagamento foi aprovado! ✅

💰 Valor pago: *{{total_amount}}*
📦 Status: Em preparação

Seu pedido está sendo preparado e em breve entraremos em contato com as informações de entrega.

Obrigado pela preferência! 😊'),

  -- Broadcast Template
  (NULL, 'BROADCAST', 'Mensagem em Massa', '📢 *Comunicado Importante*

Olá! 👋

Esta é uma mensagem automática do nosso sistema.

Para mais informações, entre em contato conosco.

Obrigado! 😊')

ON CONFLICT (tenant_id, type) DO UPDATE SET
  content = EXCLUDED.content,
  updated_at = now();