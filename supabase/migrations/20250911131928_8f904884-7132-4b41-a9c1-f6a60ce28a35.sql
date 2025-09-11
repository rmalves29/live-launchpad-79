-- Insert default WhatsApp templates (without ON CONFLICT)
INSERT INTO whatsapp_templates (tenant_id, type, title, content) 
SELECT NULL, 'ITEM_ADDED', 'Item Adicionado ao Pedido', 
'🛒 *Item adicionado ao pedido*

✅ {{produto}} {{codigo}}
Qtd: *{{quantidade}}*
Preço: *{{preco}}*

💰 Subtotal: *{{total}}*

Digite outros códigos para adicionar mais itens ou responda "finalizar" para concluir seu pedido!'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE tenant_id IS NULL AND type = 'ITEM_ADDED')

UNION ALL

SELECT NULL, 'PRODUCT_CANCELED', 'Produto Cancelado', 
'❌ *Item removido do pedido*

{{produto}}
Qtd: *{{quantidade}}*
Valor: *{{valor}}*

O item foi removido do seu carrinho.
Continue comprando ou digite "finalizar" para ver o total! 🛍️'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE tenant_id IS NULL AND type = 'PRODUCT_CANCELED')

UNION ALL

SELECT NULL, 'PAID_ORDER', 'Pedido Pago', 
'🎉 *Pagamento Confirmado - Pedido #{{order_id}}*

Seu pagamento foi aprovado! ✅

💰 Valor pago: *{{total_amount}}*
📦 Status: Em preparação

Seu pedido está sendo preparado e em breve entraremos em contato com as informações de entrega.

Obrigado pela preferência! 😊'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE tenant_id IS NULL AND type = 'PAID_ORDER')

UNION ALL

SELECT NULL, 'BROADCAST', 'Mensagem em Massa', 
'📢 *Comunicado Importante*

Olá! 👋

Esta é uma mensagem automática do nosso sistema.

Para mais informações, entre em contato conosco.

Obrigado! 😊'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE tenant_id IS NULL AND type = 'BROADCAST');