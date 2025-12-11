-- Add client_token column for Z-API security token
ALTER TABLE public.integration_whatsapp 
ADD COLUMN IF NOT EXISTS zapi_client_token TEXT NULL;