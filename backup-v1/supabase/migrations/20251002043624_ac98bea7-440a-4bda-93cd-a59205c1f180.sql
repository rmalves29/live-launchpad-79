-- Criar integração WhatsApp para MANIA DE MULHER
INSERT INTO integration_whatsapp (
  tenant_id, 
  instance_name, 
  api_url, 
  is_active, 
  webhook_secret
)
VALUES (
  '08f2b1b9-3988-489e-8186-c60f0c0b0622'::uuid,
  'WhatsApp Principal - MANIA DE MULHER',
  'http://localhost:3333',
  true,
  'webhook_secret_123'
)
ON CONFLICT (id) DO NOTHING;