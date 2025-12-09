-- Insert default WhatsApp templates
INSERT INTO public.whatsapp_templates (type, title, content) 
VALUES 
  ('ITEM_ADDED', 'Item Adicionado ao Carrinho', 'Olá {{nome_cliente}}! 🛍️

Confirmamos que o item {{produto}} (quantidade: {{quantidade}}) foi adicionado ao seu carrinho.

Valor unitário: R$ {{preco}}
Total: R$ {{total}}

Para finalizar seu pedido e escolher a forma de pagamento, acesse nosso checkout.

Qualquer dúvida, estamos à disposição!'),
  
  ('PRODUCT_CANCELED', 'Produto Cancelado', 'Olá {{nome_cliente}},

Informamos que o produto {{produto}} foi cancelado do seu pedido.

Se isso foi um erro ou se você gostaria de reagendar, entre em contato conosco.

Agradecemos a compreensão!'),
  
  ('BROADCAST', 'Mensagem em Massa', 'Olá {{nome_cliente}}! 👋

Temos novidades incríveis para você!

[Personalize esta mensagem com sua promoção, lançamento ou comunicado]

Não perca essa oportunidade!

Atenciosamente,
Equipe MM Live Commerce')
ON CONFLICT (type) DO NOTHING;