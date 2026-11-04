-- Contratação direta: 3 opções (Live, Grupos WhatsApp, Combo) com preço do combo próprio
ALTER TABLE public.platform_affiliate_settings
  ADD COLUMN IF NOT EXISTS combo_price numeric NOT NULL DEFAULT 499,
  ADD COLUMN IF NOT EXISTS signup_pagarme_plan_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Aproveita o plano Pagar.me já criado para o valor avulso
UPDATE public.platform_affiliate_settings
   SET signup_pagarme_plan_ids = jsonb_build_object(to_char(signup_pagarme_plan_price, 'FM999990.00'), signup_pagarme_plan_id)
 WHERE id = 1 AND signup_pagarme_plan_id IS NOT NULL AND signup_pagarme_plan_price IS NOT NULL
   AND signup_pagarme_plan_ids = '{}'::jsonb;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_signup_plan_chk;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_signup_plan_chk
  CHECK (signup_plan IS NULL OR signup_plan IN ('live','grupos_vip','completo'));
