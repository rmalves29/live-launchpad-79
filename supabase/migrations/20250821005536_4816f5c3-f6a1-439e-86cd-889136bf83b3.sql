-- Add new columns to orders table
ALTER TABLE public.orders 
ADD COLUMN printed BOOLEAN DEFAULT FALSE,
ADD COLUMN observation TEXT;

-- Add new template type for paid order notification
INSERT INTO public.whatsapp_templates (type, title, content) 
VALUES ('PAID_ORDER', 'Pedido Pago', 'Olá {{customer_name}}! 🎉

Seu pedido #{{order_id}} foi confirmado com sucesso! ✅

📦 Detalhes do pedido:
{{order_details}}

💰 Valor total: R$ {{total_amount}}

Em breve entraremos em contato com as informações de entrega.

Obrigado pela preferência! 😊')
ON CONFLICT (type) DO UPDATE SET
title = EXCLUDED.title,
content = EXCLUDED.content;