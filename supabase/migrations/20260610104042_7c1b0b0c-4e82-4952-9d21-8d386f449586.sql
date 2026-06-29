ALTER TABLE public.integration_whatsapp
  ADD COLUMN IF NOT EXISTS item_added_button_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS item_added_button_label text NOT NULL DEFAULT 'Pagar Agora',
  ADD COLUMN IF NOT EXISTS item_added_button_url text;