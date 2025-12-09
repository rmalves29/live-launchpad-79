-- Multi-tenant system implementation

-- 1. Enums for roles
CREATE TYPE user_tenant_role AS ENUM ('superadmin', 'tenant_admin', 'operator');

-- 2. Tenants table
CREATE TABLE public.tenants (
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

-- 3. Update profiles table to include tenant relationship
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Update tenant_role column to use new enum if it doesn't already use it
-- (This will fail silently if the column already exists with the right type)
DO $$
BEGIN
  ALTER TABLE public.profiles ALTER COLUMN tenant_role TYPE user_tenant_role USING tenant_role::text::user_tenant_role;
EXCEPTION
  WHEN OTHERS THEN NULL;
END
$$;

-- 4. Integration tables
CREATE TABLE public.integration_mp (
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
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

CREATE TABLE public.integration_me (
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
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

CREATE TABLE public.integration_wpp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  business_phone text NOT NULL,
  session_status text DEFAULT 'offline',
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, instance_name)
);

-- 5. Add tenant_id to existing tables
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.cart_items 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.carts 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.coupons 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.gifts 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.customer_tags 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.customer_tag_assignments 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.customer_whatsapp_groups 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.frete_config 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.frete_cotacoes 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.frete_envios 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.whatsapp_templates 
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 6. Create webhook logs table
CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  webhook_type text NOT NULL, -- 'mercadopago', 'melhorenvio', 'whatsapp_incoming', 'whatsapp_delivery'
  status_code integer NOT NULL,
  payload jsonb,
  response text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 7. Create tenant functions
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
  SELECT tenant_role = 'superadmin' FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_role IN ('superadmin', 'tenant_admin') FROM public.profiles WHERE id = auth.uid();
$$;

-- 8. Update existing functions
DROP FUNCTION IF EXISTS public.is_master_user();
DROP FUNCTION IF EXISTS public.is_admin_or_master();

CREATE OR REPLACE FUNCTION public.is_master_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_role = 'superadmin' FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_master()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_role IN ('superadmin', 'tenant_admin') FROM public.profiles WHERE id = auth.uid();
$$;

-- 9. Enable RLS on new tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_mp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_me ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_wpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies for tenants
CREATE POLICY "Superadmins can manage all tenants"
ON public.tenants FOR ALL
USING (is_superadmin());

CREATE POLICY "Users can view their own tenant"
ON public.tenants FOR SELECT
USING (id = get_current_user_tenant_id());

-- 11. RLS Policies for integrations
CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_mp FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_tenant_admin());

CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_me FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_tenant_admin());

CREATE POLICY "Tenant admins can manage tenant integrations"
ON public.integration_wpp FOR ALL
USING (tenant_id = get_current_user_tenant_id() AND is_tenant_admin());

-- 12. RLS Policies for webhook logs
CREATE POLICY "Users can view tenant webhook logs"
ON public.webhook_logs FOR SELECT
USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "System can insert webhook logs"
ON public.webhook_logs FOR INSERT
WITH CHECK (true);

-- 13. Update triggers for tenant_id assignment
CREATE OR REPLACE FUNCTION public.set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tenant_id UUID;
BEGIN
  -- Get tenant_id from current user
  SELECT tenant_id INTO user_tenant_id 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  -- Set tenant_id on new record if not already set
  IF user_tenant_id IS NOT NULL AND NEW.tenant_id IS NULL THEN
    NEW.tenant_id = user_tenant_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add triggers for automatic tenant_id assignment
DROP TRIGGER IF EXISTS set_tenant_id_products ON public.products;
CREATE TRIGGER set_tenant_id_products
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

DROP TRIGGER IF EXISTS set_tenant_id_customers ON public.customers;
CREATE TRIGGER set_tenant_id_customers
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

DROP TRIGGER IF EXISTS set_tenant_id_orders ON public.orders;
CREATE TRIGGER set_tenant_id_orders
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 14. Update updated_at triggers
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integration_mp_updated_at
  BEFORE UPDATE ON public.integration_mp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integration_me_updated_at
  BEFORE UPDATE ON public.integration_me
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integration_wpp_updated_at
  BEFORE UPDATE ON public.integration_wpp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 15. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_paid ON public.orders(tenant_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant ON public.webhook_logs(tenant_id, created_at DESC);

-- 16. Create a default tenant for existing data migration
INSERT INTO public.tenants (tenant_key, name, slug, is_active)
VALUES ('default', 'Sistema Principal', 'default', true)
ON CONFLICT (tenant_key) DO NOTHING;

-- 17. Update the handle_new_user function to use new enum
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, tenant_role)
  VALUES (
    NEW.id, 
    NEW.email,
    CASE 
      WHEN NEW.email = 'rmalves21@hotmail.com' THEN 'superadmin'::user_tenant_role
      ELSE 'operator'::user_tenant_role
    END
  );
  RETURN NEW;
END;
$$;