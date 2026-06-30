
ALTER TABLE public.integration_whatsapp 
  ADD COLUMN IF NOT EXISTS uazapi_url text,
  ADD COLUMN IF NOT EXISTS uazapi_token text,
  ADD COLUMN IF NOT EXISTS uazapi_admin_token text;

-- Migrar provider 'evolution' para 'uazapi' (caso exista)
UPDATE public.integration_whatsapp SET provider = 'uazapi' WHERE provider = 'evolution';
