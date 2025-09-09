-- Add missing columns and complete multi-tenant setup

-- 1. Add tenant_key to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS tenant_key text UNIQUE;

-- Update existing tenants to have tenant_key based on slug
UPDATE public.tenants SET tenant_key = slug WHERE tenant_key IS NULL;

-- Make tenant_key NOT NULL after updating
ALTER TABLE public.tenants ALTER COLUMN tenant_key SET NOT NULL;

-- 2. Integration tables (create if not exists)
CREATE TABLE IF NOT EXISTS public.integration_mp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  public_key text,
  access_token text,
  client_id text,
  client_secret text,
  redirect_uri text,
  public_base_url text,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_mp_tenant ON public.integration_mp(tenant_id);

CREATE TABLE IF NOT EXISTS public.integration_me (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id text,
  client_secret text,
  redirect_uri text,
  access_token text,
  refresh_token text,
  account_id text,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_me_tenant ON public.integration_me(tenant_id);

CREATE TABLE IF NOT EXISTS public.integration_wpp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  business_phone text NOT NULL,
  session_status text DEFAULT 'offline',
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_wpp_tenant_instance ON public.integration_wpp(tenant_id, instance_name);

-- 3. Create webhook logs table
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  webhook_type text NOT NULL,
  status_code integer NOT NULL,
  payload jsonb,
  response text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 4. Enable RLS on new tables
ALTER TABLE public.integration_mp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_me ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_wpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for integrations
DROP POLICY IF EXISTS "Tenant admins can manage tenant integrations" ON public.integration_mp;
CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_mp FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_tenant_admin());

DROP POLICY IF EXISTS "Tenant admins can manage tenant integrations" ON public.integration_me;
CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_me FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_tenant_admin());

DROP POLICY IF EXISTS "Tenant admins can manage tenant integrations" ON public.integration_wpp;
CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_wpp FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_tenant_admin());

-- 6. RLS Policies for webhook logs
DROP POLICY IF EXISTS "Users can view tenant webhook logs" ON public.webhook_logs;
CREATE POLICY "Users can view tenant webhook logs"
ON public.webhook_logs FOR SELECT
USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "System can insert webhook logs" ON public.webhook_logs;
CREATE POLICY "System can insert webhook logs"
ON public.webhook_logs FOR INSERT
WITH CHECK (true);

-- 7. Update updated_at triggers
DROP TRIGGER IF EXISTS update_integration_mp_updated_at ON public.integration_mp;
CREATE TRIGGER update_integration_mp_updated_at
  BEFORE UPDATE ON public.integration_mp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_integration_me_updated_at ON public.integration_me;
CREATE TRIGGER update_integration_me_updated_at
  BEFORE UPDATE ON public.integration_me
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_integration_wpp_updated_at ON public.integration_wpp;
CREATE TRIGGER update_integration_wpp_updated_at
  BEFORE UPDATE ON public.integration_wpp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant ON public.webhook_logs(tenant_id, created_at DESC);

-- 9. Update existing data to belong to default tenant (create default if needed)
INSERT INTO public.tenants (tenant_key, name, slug, is_active)
VALUES ('default', 'Sistema Principal', 'default', true)
ON CONFLICT (tenant_key) DO NOTHING;

-- 10. Set default tenant for existing data
DO $$ 
DECLARE
  default_tenant_id UUID;
BEGIN
  SELECT id INTO default_tenant_id FROM public.tenants WHERE tenant_key = 'default';
  
  IF default_tenant_id IS NOT NULL THEN
    UPDATE public.products SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.customers SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.orders SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    
    -- Update profiles without tenant_id to belong to default tenant
    UPDATE public.profiles SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;