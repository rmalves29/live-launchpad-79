-- Add missing tenant_key column and complete multi-tenant setup

-- 1. Add tenant_key column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS tenant_key text;

-- 2. Update existing tenants to have a tenant_key
UPDATE public.tenants 
SET tenant_key = slug 
WHERE tenant_key IS NULL;

-- 3. Make tenant_key unique and not null
ALTER TABLE public.tenants 
ALTER COLUMN tenant_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_tenant_key ON public.tenants(tenant_key);

-- 4. Create integration tables (if not exist)
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

-- 5. Create webhook logs table
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

-- 6. Enable RLS on new tables
ALTER TABLE public.integration_mp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_me ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_wpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- 7. Create/Update RLS policies for integrations
DROP POLICY IF EXISTS "Tenant admins can manage tenant integrations" ON public.integration_mp;
CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_mp FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_admin_or_master());

DROP POLICY IF EXISTS "Tenant admins can manage tenant integrations" ON public.integration_me;
CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_me FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_admin_or_master());

DROP POLICY IF EXISTS "Tenant admins can manage tenant integrations" ON public.integration_wpp;
CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_wpp FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_admin_or_master());

-- 8. RLS Policies for webhook logs
DROP POLICY IF EXISTS "Users can view tenant webhook logs" ON public.webhook_logs;
CREATE POLICY "Users can view tenant webhook logs"
ON public.webhook_logs FOR SELECT
USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "System can insert webhook logs" ON public.webhook_logs;
CREATE POLICY "System can insert webhook logs"
ON public.webhook_logs FOR INSERT
WITH CHECK (true);

-- 9. Update triggers
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

-- 10. Assign existing user to default tenant
UPDATE public.profiles 
SET tenant_id = (SELECT id FROM public.tenants WHERE tenant_key = 'default')
WHERE email = 'rmalves21@hotmail.com' AND tenant_id IS NULL;