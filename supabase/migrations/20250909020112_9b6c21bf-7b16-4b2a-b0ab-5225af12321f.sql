-- Multi-tenant system implementation (adjusted for existing enum)

-- 1. Create tenants table if not exists
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text UNIQUE NOT NULL,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  whatsapp_api_url text,
  melhor_envio_from_cep text DEFAULT '31575060',
  melhor_envio_env text DEFAULT 'sandbox',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Update profiles table to include tenant relationship
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 3. Integration tables
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

-- 4. Add tenant_id to existing tables if not exists
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

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

-- 6. Create tenant functions
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_role = 'master' FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_role IN ('master', 'admin') FROM public.profiles WHERE id = auth.uid();
$$;

-- 7. Enable RLS on new tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_mp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_me ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_wpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for tenants
DROP POLICY IF EXISTS "Superadmins can manage all tenants" ON public.tenants;
CREATE POLICY "Superadmins can manage all tenants"
ON public.tenants FOR ALL
USING (is_superadmin());

DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;
CREATE POLICY "Users can view their own tenant"
ON public.tenants FOR SELECT
USING (id = get_current_user_tenant_id());

-- 9. RLS Policies for integrations
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

-- 10. RLS Policies for webhook logs
DROP POLICY IF EXISTS "Users can view tenant webhook logs" ON public.webhook_logs;
CREATE POLICY "Users can view tenant webhook logs"
ON public.webhook_logs FOR SELECT
USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "System can insert webhook logs" ON public.webhook_logs;
CREATE POLICY "System can insert webhook logs"
ON public.webhook_logs FOR INSERT
WITH CHECK (true);

-- 11. Update updated_at triggers
DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

-- 12. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_paid ON public.orders(tenant_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant ON public.webhook_logs(tenant_id, created_at DESC);

-- 13. Create a default tenant for existing data migration
INSERT INTO public.tenants (tenant_key, name, slug, is_active)
VALUES ('default', 'Sistema Principal', 'default', true)
ON CONFLICT (tenant_key) DO NOTHING;

-- 14. Update existing data to belong to default tenant
UPDATE public.products SET tenant_id = (SELECT id FROM public.tenants WHERE tenant_key = 'default') WHERE tenant_id IS NULL;
UPDATE public.customers SET tenant_id = (SELECT id FROM public.tenants WHERE tenant_key = 'default') WHERE tenant_id IS NULL;
UPDATE public.orders SET tenant_id = (SELECT id FROM public.tenants WHERE tenant_key = 'default') WHERE tenant_id IS NULL;