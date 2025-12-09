-- Drop the existing check constraint
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_type_check;

-- Add new check constraint with PAID_ORDER included
ALTER TABLE public.whatsapp_templates 
ADD CONSTRAINT whatsapp_templates_type_check 
CHECK (type = ANY (ARRAY['ITEM_ADDED'::text, 'PRODUCT_CANCELED'::text, 'BROADCAST'::text, 'PAID_ORDER'::text]));

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