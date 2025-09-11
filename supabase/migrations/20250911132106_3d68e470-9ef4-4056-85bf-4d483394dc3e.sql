-- Insert WhatsApp templates for existing tenants with proper casting
INSERT INTO whatsapp_templates (tenant_id, type, title, content) 
VALUES 
  ((SELECT id FROM tenants WHERE is_active = true LIMIT 1), 'ITEM_ADDED'::whatsapp_template_type, 'Item Adicionado ao Pedido', '🛒 *Item adicionado ao pedido*

✅ {{produto}} {{codigo}}
Qtd: *{{quantidade}}*
Preço: *{{preco}}*

💰 Subtotal: *{{total}}*

Digite outros códigos para adicionar mais itens ou responda "finalizar" para concluir seu pedido!'),

  ((SELECT id FROM tenants WHERE is_active = true LIMIT 1), 'PRODUCT_CANCELED'::whatsapp_template_type, 'Produto Cancelado', '❌ *Item removido do pedido*

{{produto}}
Qtd: *{{quantidade}}*
Valor: *{{valor}}*

O item foi removido do seu carrinho.
Continue comprando ou digite "finalizar" para ver o total! 🛍️'),

  ((SELECT id FROM tenants WHERE is_active = true LIMIT 1), 'PAID_ORDER'::whatsapp_template_type, 'Pedido Pago', '🎉 *Pagamento Confirmado - Pedido #{{order_id}}*

Seu pagamento foi aprovado! ✅

💰 Valor pago: *{{total_amount}}*
📦 Status: Em preparação

Seu pedido está sendo preparado e em breve entraremos em contato com as informações de entrega.

Obrigado pela preferência! 😊'),

  ((SELECT id FROM tenants WHERE is_active = true LIMIT 1), 'BROADCAST'::whatsapp_template_type, 'Mensagem em Massa', '📢 *Comunicado Importante*

Olá! 👋

Esta é uma mensagem automática do nosso sistema.

Para mais informações, entre em contato conosco.

Obrigado! 😊')

ON CONFLICT DO NOTHING;