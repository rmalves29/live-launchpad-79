-- Atualizar URL do backend WhatsApp para o tenant principal
UPDATE integration_whatsapp 
SET api_url = 'https://backend-production-2599.up.railway.app', 
    updated_at = now() 
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';