-- Add missing columns to bling_integrations table
ALTER TABLE public.bling_integrations 
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS token_type text DEFAULT 'Bearer';