-- Corrigir URL do servidor WhatsApp no banco de dados
UPDATE integration_whatsapp 
SET api_url = 'https://backend-production-2599.up.railway.app'
WHERE tenant_id = '23643148-b83f-42da-9dd6-ad0a198b6338' 
  AND api_url = 'https://live-launchpad-79-production.up.railway.app';