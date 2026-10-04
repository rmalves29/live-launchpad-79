-- Cupons, brindes e fretes criados na Loja da Live valem SÓ para a live (channel = 'live').
-- Tudo que já existia continua como 'bazar' e nunca aparece na Loja da Live.
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'bazar';
ALTER TABLE public.gifts ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'bazar';
ALTER TABLE public.custom_shipping_options ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'bazar';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_channel_check') THEN
    ALTER TABLE public.coupons ADD CONSTRAINT coupons_channel_check CHECK (channel IN ('bazar', 'live'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gifts_channel_check') THEN
    ALTER TABLE public.gifts ADD CONSTRAINT gifts_channel_check CHECK (channel IN ('bazar', 'live'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_shipping_options_channel_check') THEN
    ALTER TABLE public.custom_shipping_options ADD CONSTRAINT custom_shipping_options_channel_check CHECK (channel IN ('bazar', 'live'));
  END IF;
END $$;
