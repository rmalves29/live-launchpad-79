-- Criar índice único para shipping_integrations se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'shipping_integrations' 
        AND indexname = 'shipping_integrations_tenant_provider_idx'
    ) THEN
        CREATE UNIQUE INDEX shipping_integrations_tenant_provider_idx 
        ON shipping_integrations (tenant_id, provider);
    END IF;
END $$;

-- Inserir dados na shipping_integrations replicando da integration_me
INSERT INTO shipping_integrations (
  tenant_id,
  provider,
  client_id,
  client_secret,
  access_token,
  from_cep,
  is_active,
  sandbox,
  created_at,
  updated_at
) 
SELECT 
  tenant_id,
  'melhor_envio' as provider,
  client_id,
  client_secret,
  access_token,
  from_cep,
  is_active,
  (environment = 'sandbox') as sandbox,
  created_at,
  updated_at
FROM integration_me 
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'
ON CONFLICT (tenant_id, provider) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  client_secret = EXCLUDED.client_secret,
  access_token = EXCLUDED.access_token,
  from_cep = EXCLUDED.from_cep,
  is_active = EXCLUDED.is_active,
  sandbox = EXCLUDED.sandbox,
  updated_at = now();

-- Atualizar frete_config com os dados mais recentes da integration_me
UPDATE frete_config SET
  client_id = (SELECT client_id FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  client_secret = (SELECT client_secret FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  access_token = (SELECT access_token FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_nome = (SELECT from_name FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_email = (SELECT from_email FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_telefone = (SELECT from_phone FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_documento = (SELECT from_document FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_endereco_rua = (SELECT from_address FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_endereco_numero = (SELECT from_number FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_endereco_comp = (SELECT from_complement FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_bairro = (SELECT from_district FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_cidade = (SELECT from_city FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  remetente_uf = (SELECT from_state FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  cep_origem = (SELECT from_cep FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'),
  api_base_url = CASE 
    WHEN (SELECT environment FROM integration_me WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622') = 'production' 
    THEN 'https://melhorenvio.com.br/api'
    ELSE 'https://sandbox.melhorenvio.com.br/api'
  END,
  updated_at = now()
WHERE id = 1;