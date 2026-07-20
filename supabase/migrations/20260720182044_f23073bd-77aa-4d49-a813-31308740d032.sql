
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_scope TEXT NOT NULL DEFAULT 'full';
COMMENT ON COLUMN public.profiles.access_scope IS 'full = sistema completo; fluxo_envio = restrito à landing/app Fluxo de Envio';
