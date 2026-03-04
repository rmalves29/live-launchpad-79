-- Add enabled_services column to shipping_integrations
-- Stores a JSON object like {"PAC": true, "SEDEX": true, "Mini Envios": false}
-- When null or empty, all services are shown (backward compatible)
ALTER TABLE public.shipping_integrations 
ADD COLUMN IF NOT EXISTS enabled_services text DEFAULT NULL;

COMMENT ON COLUMN public.shipping_integrations.enabled_services IS 'JSON object with service names as keys and boolean values to control which services appear in checkout';
