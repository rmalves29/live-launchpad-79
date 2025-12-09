-- Criar enum para tipos de usuário no sistema multi-tenant
CREATE TYPE public.user_tenant_role AS ENUM ('master', 'admin', 'user');

-- Criar tabela de tenants/empresas
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Configurações específicas do tenant
  whatsapp_api_url TEXT,
  melhor_envio_from_cep TEXT DEFAULT '31575060',
  melhor_envio_env TEXT DEFAULT 'sandbox'
);

-- Habilitar RLS na tabela tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Atualizar tabela profiles para incluir tenant e role
ALTER TABLE public.profiles 
ADD COLUMN tenant_id UUID REFERENCES public.tenants(id),
ADD COLUMN tenant_role user_tenant_role DEFAULT 'user';

-- Adicionar tenant_id em todas as tabelas existentes
ALTER TABLE public.customers ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.products ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.carts ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.cart_items ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.orders ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.whatsapp_messages ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.whatsapp_templates ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.customer_tags ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.customer_tag_assignments ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.customer_whatsapp_groups ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.coupons ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.gifts ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.frete_config ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.frete_cotacoes ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.frete_envios ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);

-- Criar tenant master (empresa principal)
INSERT INTO public.tenants (id, name, slug, is_active) 
VALUES (gen_random_uuid(), 'Master Company', 'master', true);

-- Função para obter tenant_id do usuário atual
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Função para verificar se o usuário é master
CREATE OR REPLACE FUNCTION public.is_master_user()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_role = 'master' FROM public.profiles WHERE id = auth.uid();
$$;

-- Função para verificar se o usuário é admin ou master
CREATE OR REPLACE FUNCTION public.is_admin_or_master()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_role IN ('admin', 'master') FROM public.profiles WHERE id = auth.uid();
$$;

-- RLS Policies para tenants
CREATE POLICY "Masters can view all tenants" ON public.tenants
FOR SELECT USING (is_master_user());

CREATE POLICY "Masters can manage all tenants" ON public.tenants
FOR ALL USING (is_master_user());

CREATE POLICY "Users can view their own tenant" ON public.tenants
FOR SELECT USING (id = get_current_user_tenant_id());

-- Atualizar RLS policies das tabelas existentes para usar tenant_id

-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public can manage profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Masters can view all profiles" ON public.profiles
FOR SELECT USING (is_master_user());

CREATE POLICY "Masters can manage all profiles" ON public.profiles
FOR ALL USING (is_master_user());

CREATE POLICY "Admins can view tenant profiles" ON public.profiles
FOR SELECT USING (tenant_role = 'admin' AND tenant_id = get_current_user_tenant_id());

-- Customers
DROP POLICY IF EXISTS "Public can view all customers" ON public.customers;
DROP POLICY IF EXISTS "Public can create customers" ON public.customers;
DROP POLICY IF EXISTS "Public can update customers" ON public.customers;
DROP POLICY IF EXISTS "Public can delete customers" ON public.customers;

CREATE POLICY "Users can view tenant customers" ON public.customers
FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "Users can manage tenant customers" ON public.customers
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Products
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Public can manage products" ON public.products;

CREATE POLICY "Anyone can view active tenant products" ON public.products
FOR SELECT USING (is_active = true AND (tenant_id = get_current_user_tenant_id() OR tenant_id IS NULL));

CREATE POLICY "Users can manage tenant products" ON public.products
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Orders
DROP POLICY IF EXISTS "Public can manage orders" ON public.orders;

CREATE POLICY "Users can view tenant orders" ON public.orders
FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "Users can manage tenant orders" ON public.orders
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Aplicar políticas similares para todas as outras tabelas
-- Carts
DROP POLICY IF EXISTS "Public can manage carts" ON public.carts;
CREATE POLICY "Users can manage tenant carts" ON public.carts
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Cart Items
DROP POLICY IF EXISTS "Public can manage cart items" ON public.cart_items;
CREATE POLICY "Users can manage tenant cart items" ON public.cart_items
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- WhatsApp Messages
DROP POLICY IF EXISTS "Public can manage whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Users can manage tenant whatsapp messages" ON public.whatsapp_messages
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- WhatsApp Templates
DROP POLICY IF EXISTS "Everyone can read templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Public can manage templates" ON public.whatsapp_templates;
CREATE POLICY "Users can view tenant templates" ON public.whatsapp_templates
FOR SELECT USING (tenant_id = get_current_user_tenant_id());
CREATE POLICY "Users can manage tenant templates" ON public.whatsapp_templates
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Customer Tags
DROP POLICY IF EXISTS "Public can manage customer tags" ON public.customer_tags;
CREATE POLICY "Users can manage tenant customer tags" ON public.customer_tags
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Customer Tag Assignments
DROP POLICY IF EXISTS "Public can manage customer tag assignments" ON public.customer_tag_assignments;
CREATE POLICY "Users can manage tenant customer tag assignments" ON public.customer_tag_assignments
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Customer WhatsApp Groups
DROP POLICY IF EXISTS "Public can manage customer whatsapp groups" ON public.customer_whatsapp_groups;
CREATE POLICY "Users can manage tenant customer whatsapp groups" ON public.customer_whatsapp_groups
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Coupons
DROP POLICY IF EXISTS "Public can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public can manage coupons" ON public.coupons;
CREATE POLICY "Users can view tenant active coupons" ON public.coupons
FOR SELECT USING (is_active = true AND tenant_id = get_current_user_tenant_id());
CREATE POLICY "Users can manage tenant coupons" ON public.coupons
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Gifts
DROP POLICY IF EXISTS "Public can view active gifts" ON public.gifts;
DROP POLICY IF EXISTS "Public can manage gifts" ON public.gifts;
CREATE POLICY "Users can view tenant active gifts" ON public.gifts
FOR SELECT USING (is_active = true AND tenant_id = get_current_user_tenant_id());
CREATE POLICY "Users can manage tenant gifts" ON public.gifts
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Frete Config
DROP POLICY IF EXISTS "Public can manage frete config" ON public.frete_config;
CREATE POLICY "Users can manage tenant frete config" ON public.frete_config
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Frete Cotacoes
DROP POLICY IF EXISTS "Public can manage frete cotacoes" ON public.frete_cotacoes;
CREATE POLICY "Users can manage tenant frete cotacoes" ON public.frete_cotacoes
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Frete Envios
DROP POLICY IF EXISTS "Public can manage frete envios" ON public.frete_envios;
CREATE POLICY "Users can manage tenant frete envios" ON public.frete_envios
FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Trigger para definir tenant_id automaticamente em novos registros
CREATE OR REPLACE FUNCTION public.set_tenant_id()
RETURNS TRIGGER AS $$
DECLARE
  user_tenant_id UUID;
BEGIN
  -- Obter tenant_id do usuário atual
  SELECT tenant_id INTO user_tenant_id 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  -- Definir tenant_id no novo registro
  IF user_tenant_id IS NOT NULL THEN
    NEW.tenant_id = user_tenant_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Aplicar trigger nas tabelas principais
CREATE TRIGGER set_tenant_id_customers BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_products BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_carts BEFORE INSERT ON public.carts FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_cart_items BEFORE INSERT ON public.cart_items FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_orders BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_whatsapp_messages BEFORE INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_whatsapp_templates BEFORE INSERT ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_customer_tags BEFORE INSERT ON public.customer_tags FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_customer_tag_assignments BEFORE INSERT ON public.customer_tag_assignments FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_customer_whatsapp_groups BEFORE INSERT ON public.customer_whatsapp_groups FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_coupons BEFORE INSERT ON public.coupons FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_gifts BEFORE INSERT ON public.gifts FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_frete_config BEFORE INSERT ON public.frete_config FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_frete_cotacoes BEFORE INSERT ON public.frete_cotacoes FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_frete_envios BEFORE INSERT ON public.frete_envios FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

-- Trigger para atualizar updated_at em tenants
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();