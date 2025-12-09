-- Add unique constraints to integration tables  
ALTER TABLE integration_mp ADD CONSTRAINT integration_mp_tenant_id_unique UNIQUE (tenant_id);
ALTER TABLE integration_me ADD CONSTRAINT integration_me_tenant_id_unique UNIQUE (tenant_id);

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
The migration completed successfully.

🚨 SECURITY LINTER RESULTS 🚨
Found 9 linter issues in the Supabase project:

WARN 1: Function Search Path Mutable
  Level: WARN
  Description: Detects functions where the search_path parameter is not set.
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

WARN 2: Function Search Path Mutable
  Level: WARN
  Description: Detects functions where the search_path parameter is not set.
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

WARN 3: Function Search Path Mutable
  Level: WARN
  Description: Detects functions where the search_path parameter is not set.
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

WARN 4: Function Search Path Mutable
  Level: WARN
  Description: Detects functions where the search_path parameter is not set.
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

WARN 5: Extension in Public
  Level: WARN
  Description: Detects extensions installed in the \`public\` schema.
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

WARN 6: Auth OTP long expiry
  Level: WARN
  Description: OTP expiry exceeds recommended threshold
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/platform/going-into-prod#security

WARN 7: Leaked Password Protection Disabled
  Level: WARN
  Description: Leaked password protection is currently disabled.
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

WARN 8: Insufficient MFA Options
  Level: WARN
  Description: This project has too few multi-factor authentication (MFA) options enabled.
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/auth/auth-mfa

WARN 9: Current Postgres version has security patches available
  Level: WARN
  Description: Upgrade your postgres database to apply important security patches
  Categories: SECURITY
  How to fix (visit the link to see what to do!): https://supabase.com/docs/guides/platform/upgrading


SUMMARY:


⚠️ SECURITY WARNINGS: The linter detected 9 security warnings
ℹ️ These are existing warnings not related to your recent changes
ℹ️ You may address them when convenient, but they don't block current functionality


</migration-result>


<useful-context>
<edge-function-logs-webhook-whatsapp>

</edge-function-logs-webhook-whatsapp>
<edge-function-logs-bling-integration>

</edge-function-logs-bling-integration>
<edge-function-logs-melhor-envio-shipping>

</edge-function-logs-melhor-envio-shipping>
<edge-function-logs-tenant-create-user>

</edge-function-logs-tenant-create-user>
<edge-function-logs-whatsapp-multitenant>

</edge-function-logs-whatsapp-multitenant>
<edge-function-logs-admin-set-password>

</edge-function-logs-admin-set-password>
<edge-function-logs-get-integration-settings>

</edge-function-logs-get-integration-settings>
<edge-function-logs-save-integration-settings>

</edge-function-logs-save-integration-settings>
<edge-function-logs-tenant-generate-login-link>

</edge-function-logs-tenant-generate-login-link>
<edge-function-logs-tenant-reset-password>

</edge-function-logs-tenant-reset-password>
<edge-function-logs-whatsapp-add-label>

</edge-function-logs-whatsapp-add-label>
</useful-context>



<current-route>
The user is currently on this route: /pedidos.
This may be relevant.
</current-route>
<current-view>
The user is currently viewing: preview.
The user is currently viewing the live preview of their project.
</current-view> </function_results>

<function_calls>
<invoke name="supabase--migration">
<parameter name="query">-- Add unique constraints and insert data for integration tables
DO $$
BEGIN
  -- Add unique constraint only if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_mp_tenant_id_unique') THEN
    ALTER TABLE integration_mp ADD CONSTRAINT integration_mp_tenant_id_unique UNIQUE (tenant_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_me_tenant_id_unique') THEN
    ALTER TABLE integration_me ADD CONSTRAINT integration_me_tenant_id_unique UNIQUE (tenant_id);
  END IF;
END $$;

-- Insert or update configurations for both active tenants
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
    'MELHOR_ENVIO_TOKEN_PLACEHOLDER',
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
    'MELHOR_ENVIO_TOKEN_PLACEHOLDER',
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

-- Add tenant_key column and update values
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_key TEXT;
UPDATE tenants SET tenant_key = slug WHERE tenant_key IS NULL;