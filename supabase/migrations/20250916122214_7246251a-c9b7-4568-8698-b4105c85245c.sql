-- Insert Mercado Pago configuration for BIQUINI DA TAHY tenant
INSERT INTO integration_mp (
  tenant_id,
  client_id,
  client_secret,
  access_token,
  public_key,
  webhook_secret,
  environment,
  is_active,
  created_at,
  updated_at
) VALUES (
  '3c92bf57-a114-4690-b4cf-642078fc9df9',
  '8967294933250718',
  '6Umfiabw1AhBWR8TylqKoggfxQIn2k1K',
  'APP_USR-7249924773452394-070814-f351a6fc25d1e08a7968cb18367cd8a1-213401105',
  'APP_USR-11f4d53c-b702-49b9-8ecc-ec86c10b4b39',
  'webhook_secret_mp_2024',
  'production',
  true,
  now(),
  now()
) ON CONFLICT (tenant_id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  client_secret = EXCLUDED.client_secret,
  access_token = EXCLUDED.access_token,
  public_key = EXCLUDED.public_key,
  webhook_secret = EXCLUDED.webhook_secret,
  environment = EXCLUDED.environment,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Test webhook configuration by checking if it exists
SELECT 
  t.name,
  t.tenant_key,
  mp.*
FROM tenants t
JOIN integration_mp mp ON mp.tenant_id = t.id
WHERE t.tenant_key = 'thaybiquini';