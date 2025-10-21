-- Adicionar configuração WhatsApp para o tenant BIQUINI DA TAHY
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  is_active,
  webhook_secret
)
VALUES (
  '3c92bf57-a114-4690-b4cf-642078fc9df9'::uuid,
  'WhatsApp Principal - BIQUINI DA TAHY',
  'http://localhost:3334',
  true,
  'webhook_secret_tahy'
)
ON CONFLICT (id) DO NOTHING;

-- Atualizar webhook_secret do MANIA DE MULHER para padronizar
UPDATE integration_whatsapp
SET webhook_secret = 'webhook_secret_mania'
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'::uuid
  AND webhook_secret = 'webhook_secret_123';