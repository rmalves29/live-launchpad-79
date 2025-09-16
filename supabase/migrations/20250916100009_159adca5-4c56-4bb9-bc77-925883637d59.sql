-- Create integration tables for multitenant Mercado Pago and Melhor Envio
CREATE TABLE IF NOT EXISTS integration_mp (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id TEXT,
  client_secret TEXT,
  access_token TEXT,
  public_key TEXT,
  webhook_secret TEXT,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_me (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id TEXT,
  client_secret TEXT,
  access_token TEXT,
  refresh_token TEXT,
  from_name TEXT,
  from_email TEXT,
  from_phone TEXT,
  from_document TEXT,
  from_address TEXT,
  from_number TEXT,
  from_complement TEXT,
  from_district TEXT,
  from_city TEXT,
  from_state TEXT,
  from_cep TEXT,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS policies
ALTER TABLE integration_mp ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_me ENABLE ROW LEVEL SECURITY;

-- Policies for integration_mp
CREATE POLICY "Tenant users can view their MP integration" ON integration_mp
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.tenant_id = integration_mp.tenant_id OR profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Tenant users can manage their MP integration" ON integration_mp
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.tenant_id = integration_mp.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- Policies for integration_me
CREATE POLICY "Tenant users can view their ME integration" ON integration_me
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.tenant_id = integration_me.tenant_id OR profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Tenant users can manage their ME integration" ON integration_me
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.tenant_id = integration_me.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_integration_mp_updated_at
    BEFORE UPDATE ON integration_mp
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_me_updated_at
    BEFORE UPDATE ON integration_me
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for existing tenant
INSERT INTO integration_mp (tenant_id, access_token, public_key, environment, is_active)
SELECT 
  id as tenant_id,
  'APP_USR-7249924773452394-070814-f351a6fc25d1e08a7968cb18367cd8a1-213401105' as access_token,
  'APP_USR-11f4d53c-b702-49b9-8ecc-ec86c10b4b39' as public_key,
  'production' as environment,
  true as is_active
FROM tenants 
WHERE tenant_key = 'maniadefutsal'
ON CONFLICT DO NOTHING;

INSERT INTO integration_me (
  tenant_id, 
  from_name, 
  from_email, 
  from_phone, 
  from_document,
  from_address,
  from_number,
  from_district,
  from_city,
  from_state,
  from_cep,
  environment, 
  is_active
)
SELECT 
  id as tenant_id,
  'Mania de Mulher' as from_name,
  'contato@maniadmulher.com' as from_email,
  '31999999999' as from_phone,
  '12345678000199' as from_document,
  'Rua das Flores' as from_address,
  '123' as from_number,
  'Centro' as from_district,
  'Belo Horizonte' as from_city,
  'MG' as from_state,
  '30110000' as from_cep,
  'production' as environment,
  true as is_active
FROM tenants 
WHERE tenant_key = 'maniadefutsal'
ON CONFLICT DO NOTHING;