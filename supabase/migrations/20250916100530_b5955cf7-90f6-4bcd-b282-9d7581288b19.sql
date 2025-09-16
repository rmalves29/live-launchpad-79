-- Insert configurations for both active tenants
INSERT INTO integration_mp (tenant_id, access_token, public_key, environment, is_active)
VALUES 
  ('3c92bf57-a114-4690-b4cf-642078fc9df9', 'APP_USR-7249924773452394-070814-f351a6fc25d1e08a7968cb18367cd8a1-213401105', 'APP_USR-11f4d53c-b702-49b9-8ecc-ec86c10b4b39', 'production', true),
  ('08f2b1b9-3988-489e-8186-c60f0c0b0622', 'APP_USR-7249924773452394-070814-f351a6fc25d1e08a7968cb18367cd8a1-213401105', 'APP_USR-11f4d53c-b702-49b9-8ecc-ec86c10b4b39', 'production', true)
ON CONFLICT (tenant_id) DO UPDATE SET
  access_token = EXCLUDED.access_token,
  public_key = EXCLUDED.public_key,
  is_active = true,
  updated_at = now();

INSERT INTO integration_me (
  tenant_id, 
  from_name, 
  from_email, 
  from_phone, 
  from_document,
  from_address,
  from_number,
  from_complement,
  from_district,
  from_city,
  from_state,
  from_cep,
  access_token,
  environment, 
  is_active
)
VALUES 
  (
    '3c92bf57-a114-4690-b4cf-642078fc9df9',
    'Biquini da Tahy',
    'contato@biquinidatahy.com',
    '31999999999',
    '12345678000199',
    'Rua das Flores',
    '123',
    'Sala 101',
    'Centro',
    'Belo Horizonte',
    'MG',
    '30110000',
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxOTc2OCIsImp0aSI6IjExODMzOTkyMmVjZWM4ZWFiMWEzMTJkMDA5ZjZiYWY5MDZhZTFmYWE5MzVlMDNlNWZjNzY2NTk2Y2MwOTFiNjJhMzgzOWNhZTE4MDRmNTU5IiwiaWF0IjoxNjkzOTEwMzYwLCJuYmYiOjE2OTM5MTAzNjAsImV4cCI6MTcyNTUzMjc2MCwic3ViIjoiYTc3YzhhODUtNTJmMC00MGMxLWI2NGItYmZkODIzNzYxMGZiIiwic2NvcGVzIjpbInNoaXBwaW5nLWNhbGN1bGF0ZSIsInNoaXBwaW5nLWNhbmNlbCIsInNoaXBwaW5nLWNoZWNrb3V0Iiwic2hpcHBpbmctY29tcGFuaWVzIiwic2hpcHBpbmctZ2VuZXJhdGUiLCJzaGlwcGluZy1wcmV2aWV3Iiwic2hpcHBpbmctcHJpbnQiLCJzaGlwcGluZy1zaGFyZSIsInNoaXBwaW5nLXRyYWNraW5nIiwiZWNvbW1lcmNlLXNoaXBwaW5nIiwidXNlci1pbmZvIl19.sample_token_for_tenant_1',
    'production',
    true
  ),
  (
    '08f2b1b9-3988-489e-8186-c60f0c0b0622',
    'Mania de Mulher',
    'contato@maniadmulher.com',
    '31999999999',
    '12345678000199',
    'Rua das Flores',
    '123',
    'Sala 101',
    'Centro',
    'Belo Horizonte',
    'MG',
    '30110000',
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxOTc2OCIsImp0aSI6IjExODMzOTkyMmVjZWM4ZWFiMWEzMTJkMDA5ZjZiYWY5MDZhZTFmYWE5MzVlMDNlNWZjNzY2NTk2Y2MwOTFiNjJhMzgzOWNhZTE4MDRmNTU5IiwiaWF0IjoxNjkzOTEwMzYwLCJuYmYiOjE2OTM5MTAzNjAsImV4cCI6MTcyNTUzMjc2MCwic3ViIjoiYTc3YzhhODUtNTJmMC00MGMxLWI2NGItYmZkODIzNzYxMGZiIiwic2NvcGVzIjpbInNoaXBwaW5nLWNhbGN1bGF0ZSIsInNoaXBwaW5nLWNhbmNlbCIsInNoaXBwaW5nLWNoZWNrb3V0Iiwic2hpcHBpbmctY29tcGFuaWVzIiwic2hpcHBpbmctZ2VuZXJhdGUiLCJzaGlwcGluZy1wcmV2aWV3Iiwic2hpcHBpbmctcHJpbnQiLCJzaGlwcGluZy1zaGFyZSIsInNoaXBwaW5nLXRyYWNraW5nIiwiZWNvbW1lcmNlLXNoaXBwaW5nIiwidXNlci1pbmZvIl19.sample_token_for_tenant_2',
    'production',
    true
  )
ON CONFLICT (tenant_id) DO UPDATE SET
  from_name = EXCLUDED.from_name,
  from_email = EXCLUDED.from_email,
  from_phone = EXCLUDED.from_phone,
  from_document = EXCLUDED.from_document,
  from_address = EXCLUDED.from_address,
  from_number = EXCLUDED.from_number,
  from_complement = EXCLUDED.from_complement,
  from_district = EXCLUDED.from_district,
  from_city = EXCLUDED.from_city,
  from_state = EXCLUDED.from_state,
  from_cep = EXCLUDED.from_cep,
  access_token = EXCLUDED.access_token,
  is_active = true,
  updated_at = now();

-- Add tenant_key column to tenants table for URL routing
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_key TEXT;

-- Update tenant_keys based on existing slugs
UPDATE tenants SET tenant_key = slug WHERE tenant_key IS NULL;