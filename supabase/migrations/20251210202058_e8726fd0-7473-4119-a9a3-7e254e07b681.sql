-- Add Z-API fields to integration_whatsapp table
ALTER TABLE public.integration_whatsapp
ADD COLUMN IF NOT EXISTS zapi_instance_id text,
ADD COLUMN IF NOT EXISTS zapi_token text,
ADD COLUMN IF NOT EXISTS provider text DEFAULT 'baileys',
ADD COLUMN IF NOT EXISTS connected_phone text,
ADD COLUMN IF NOT EXISTS last_status_check timestamp with time zone;