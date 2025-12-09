-- Add paid order template to whatsapp_templates
INSERT INTO public.whatsapp_templates (type, title, content) 
VALUES ('PAID_ORDER', 'Pedido Pago - Confirmação', '🎉 *Pedido Confirmado - #{{order_id}}*

Olá {{customer_name}}! Seu pagamento foi confirmado com sucesso! ✅

💰 Valor pago: R$ {{total_amount}}

📦 Seu pedido está sendo preparado e em breve entraremos em contato com as informações de entrega.

Obrigado pela preferência! 😊')
ON CONFLICT (type) DO UPDATE SET
title = EXCLUDED.title,
content = EXCLUDED.content;