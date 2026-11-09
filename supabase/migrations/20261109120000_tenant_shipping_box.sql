-- Caixa padrão de envio por empresa (cm). Usada na pré-postagem dos Correios; vazio = usa as medidas padrão do sistema.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS shipping_box_length_cm numeric(6,1),
  ADD COLUMN IF NOT EXISTS shipping_box_width_cm numeric(6,1),
  ADD COLUMN IF NOT EXISTS shipping_box_height_cm numeric(6,1);
