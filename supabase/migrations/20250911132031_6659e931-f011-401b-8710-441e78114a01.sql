-- Insert WhatsApp templates for existing tenants
WITH tenant_data AS (
  SELECT id FROM tenants WHERE is_active = true LIMIT 1
)
INSERT INTO whatsapp_templates (tenant_id, type, title, content) 
SELECT t.id, template_type, template_title, template_content
FROM tenant_data t
CROSS JOIN (
  VALUES 
    ('ITEM_ADDED', 'Item Adicionado ao Pedido', '🛒 *Item adicionado ao pedido*

✅ {{produto}} {{codigo}}
Qtd: *{{quantidade}}*
Preço: *{{preco}}*

💰 Subtotal: *{{total}}*

Digite outros códigos para adicionar mais itens ou responda "finalizar" para concluir seu pedido!'),
    
    ('PRODUCT_CANCELED', 'Produto Cancelado', '❌ *Item removido do pedido*

{{produto}}
Qtd: *{{quantidade}}*
Valor: *{{valor}}*

O item foi removido do seu carrinho.
Continue comprando ou digite "finalizar" para ver o total! 🛍️'),
    
    ('PAID_ORDER', 'Pedido Pago', '🎉 *Pagamento Confirmado - Pedido #{{order_id}}*

Seu pagamento foi aprovado! ✅

💰 Valor pago: *{{total_amount}}*
📦 Status: Em preparação

Seu pedido está sendo preparado e em breve entraremos em contato com as informações de entrega.

Obrigado pela preferência! 😊'),
    
    ('BROADCAST', 'Mensagem em Massa', '📢 *Comunicado Importante*

Olá! 👋

Esta é uma mensagem automática do nosso sistema.

Para mais informações, entre em contato conosco.

Obrigado! 😊')
) AS templates(template_type, template_title, template_content)
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates 
  WHERE tenant_id = t.id AND type = templates.template_type
);