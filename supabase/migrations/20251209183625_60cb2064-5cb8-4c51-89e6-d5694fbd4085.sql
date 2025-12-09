-- Atualizar URL do WhatsApp para usar o domínio customizado
UPDATE integration_whatsapp 
SET api_url = 'https://api.orderzaps.com',
    updated_at = now()
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';