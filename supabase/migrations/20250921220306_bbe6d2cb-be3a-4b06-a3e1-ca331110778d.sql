-- Criar integração Melhor Envio para o tenant BIQUINI DA TAHY baseada na configuração global
INSERT INTO shipping_integrations (
  tenant_id,
  provider,
  access_token,
  client_id,
  client_secret,
  refresh_token,
  token_type,
  expires_at,
  from_cep,
  sandbox,
  is_active,
  scope,
  webhook_secret
) 
SELECT 
  '3c92bf57-a114-4690-b4cf-642078fc9df9'::uuid as tenant_id, -- BIQUINI DA TAHY
  provider,
  access_token,
  client_id,
  client_secret,
  refresh_token,
  token_type,
  expires_at,
  from_cep,
  sandbox,
  is_active,
  scope,
  webhook_secret
FROM shipping_integrations 
WHERE provider = 'melhor_envio' AND tenant_id IS NULL
ON CONFLICT (tenant_id, provider) DO UPDATE SET
  access_token = EXCLUDED.access_token,
  client_id = EXCLUDED.client_id,
  client_secret = EXCLUDED.client_secret,
  refresh_token = EXCLUDED.refresh_token,
  token_type = EXCLUDED.token_type,
  expires_at = EXCLUDED.expires_at,
  from_cep = EXCLUDED.from_cep,
  sandbox = EXCLUDED.sandbox,
  is_active = EXCLUDED.is_active,
  scope = EXCLUDED.scope,
  webhook_secret = EXCLUDED.webhook_secret,
  updated_at = now();