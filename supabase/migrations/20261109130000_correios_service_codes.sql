-- Códigos dos serviços dos Correios no contrato de cada empresa. Cada cartão de postagem tem os seus
-- (ex.: {"PAC":"03298","SEDEX":"03220"}); vazio = códigos padrão do sistema (PAC 04669, SEDEX 04162, Mini Envios 04227).
-- Usado na cotação do frete (correios-shipping) e na criação da pré-postagem (correios-labels).
ALTER TABLE public.shipping_integrations
  ADD COLUMN IF NOT EXISTS service_codes jsonb;
