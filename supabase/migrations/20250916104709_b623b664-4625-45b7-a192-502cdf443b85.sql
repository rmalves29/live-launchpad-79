-- Inserir configuração do Mercado Pago para o tenant ativo
INSERT INTO integration_mp (
  tenant_id, 
  access_token, 
  environment, 
  is_active
) VALUES (
  '08f2b1b9-3988-489e-8186-c60f0c0b0622',  -- tenant_id do pedido #17
  'APP_USR-6965779632036801-091620-cfd41e1cf8f7db4a090d7dd1885e99cd-213401105',  -- token do MP
  'production',
  true
) ON CONFLICT (tenant_id) DO UPDATE SET
  access_token = EXCLUDED.access_token,
  environment = EXCLUDED.environment,
  is_active = EXCLUDED.is_active,
  updated_at = now();