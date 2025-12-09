-- Remove multi-tenant system completely

-- Drop webhook functions and edge function configurations
DROP FUNCTION IF EXISTS webhook_mercadopago_handler CASCADE;
DROP FUNCTION IF EXISTS webhook_melhorenvio_handler CASCADE;
DROP FUNCTION IF EXISTS webhook_whatsapp_handler CASCADE;

-- Drop RLS helper functions
DROP FUNCTION IF EXISTS get_current_user_tenant_id CASCADE;
DROP FUNCTION IF EXISTS is_master_user CASCADE;
DROP FUNCTION IF EXISTS is_admin_or_master CASCADE;

-- Drop integration tables
DROP TABLE IF EXISTS integration_mp CASCADE;
DROP TABLE IF EXISTS integration_me CASCADE;
DROP TABLE IF EXISTS integration_wpp CASCADE;

-- Drop tenant-related tables
DROP TABLE IF EXISTS tenants CASCADE;

-- Remove tenant_id columns from existing tables
ALTER TABLE products DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE orders DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE customers DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE carts DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE cart_items DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE coupons DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE gifts DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE whatsapp_messages DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE whatsapp_templates DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE frete_config DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE frete_cotacoes DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE frete_envios DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE customer_tags DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE customer_tag_assignments DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE customer_whatsapp_groups DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE webhook_logs DROP COLUMN IF EXISTS tenant_id;

-- Update profiles table to remove tenant-related columns
ALTER TABLE profiles DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS tenant_role;

-- Drop custom types if they exist
DROP TYPE IF EXISTS user_tenant_role;

-- Recreate simple RLS policies for basic auth

-- Products policies
DROP POLICY IF EXISTS "Users can manage tenant products" ON products;
DROP POLICY IF EXISTS "Anyone can view active tenant products" ON products;

CREATE POLICY "Anyone can view active products" 
ON products 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can manage products" 
ON products 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Orders policies
DROP POLICY IF EXISTS "Users can manage tenant orders" ON orders;
DROP POLICY IF EXISTS "Users can view tenant orders" ON orders;

CREATE POLICY "Authenticated users can manage orders" 
ON orders 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Customers policies
DROP POLICY IF EXISTS "Users can manage tenant customers" ON customers;
DROP POLICY IF EXISTS "Users can view tenant customers" ON customers;

CREATE POLICY "Authenticated users can manage customers" 
ON customers 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Carts policies
DROP POLICY IF EXISTS "Users can manage tenant carts" ON carts;

CREATE POLICY "Authenticated users can manage carts" 
ON carts 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Cart items policies
DROP POLICY IF EXISTS "Users can manage tenant cart items" ON cart_items;

CREATE POLICY "Authenticated users can manage cart items" 
ON cart_items 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Coupons policies
DROP POLICY IF EXISTS "Users can manage tenant coupons" ON coupons;
DROP POLICY IF EXISTS "Users can view tenant active coupons" ON coupons;

CREATE POLICY "Authenticated users can manage coupons" 
ON coupons 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view active coupons" 
ON coupons 
FOR SELECT 
USING (is_active = true);

-- Gifts policies
DROP POLICY IF EXISTS "Users can manage tenant gifts" ON gifts;
DROP POLICY IF EXISTS "Users can view tenant active gifts" ON gifts;

CREATE POLICY "Authenticated users can manage gifts" 
ON gifts 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view active gifts" 
ON gifts 
FOR SELECT 
USING (is_active = true);

-- WhatsApp messages policies
DROP POLICY IF EXISTS "Users can manage tenant whatsapp messages" ON whatsapp_messages;

CREATE POLICY "Authenticated users can manage whatsapp messages" 
ON whatsapp_messages 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- WhatsApp templates policies
DROP POLICY IF EXISTS "Users can manage tenant templates" ON whatsapp_templates;
DROP POLICY IF EXISTS "Users can view tenant templates" ON whatsapp_templates;

CREATE POLICY "Authenticated users can manage whatsapp templates" 
ON whatsapp_templates 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Frete config policies
DROP POLICY IF EXISTS "Users can manage tenant frete config" ON frete_config;

CREATE POLICY "Authenticated users can manage frete config" 
ON frete_config 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Frete cotacoes policies
DROP POLICY IF EXISTS "Users can manage tenant frete cotacoes" ON frete_cotacoes;

CREATE POLICY "Authenticated users can manage frete cotacoes" 
ON frete_cotacoes 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Frete envios policies
DROP POLICY IF EXISTS "Users can manage tenant frete envios" ON frete_envios;

CREATE POLICY "Authenticated users can manage frete envios" 
ON frete_envios 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Customer tags policies
DROP POLICY IF EXISTS "Users can manage tenant customer tags" ON customer_tags;

CREATE POLICY "Authenticated users can manage customer tags" 
ON customer_tags 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Customer tag assignments policies
DROP POLICY IF EXISTS "Users can manage tenant customer tag assignments" ON customer_tag_assignments;

CREATE POLICY "Authenticated users can manage customer tag assignments" 
ON customer_tag_assignments 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Customer whatsapp groups policies
DROP POLICY IF EXISTS "Users can manage tenant customer whatsapp groups" ON customer_whatsapp_groups;

CREATE POLICY "Authenticated users can manage customer whatsapp groups" 
ON customer_whatsapp_groups 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Webhook logs policies
DROP POLICY IF EXISTS "Users can view tenant webhook logs" ON webhook_logs;
DROP POLICY IF EXISTS "System can insert webhook logs" ON webhook_logs;

CREATE POLICY "Authenticated users can view webhook logs" 
ON webhook_logs 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can insert webhook logs" 
ON webhook_logs 
FOR INSERT 
WITH CHECK (true);

-- Profiles policies
DROP POLICY IF EXISTS "Masters can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Masters can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view tenant profiles" ON profiles;

CREATE POLICY "Users can view own profile" 
ON profiles 
FOR SELECT 
USING (id = auth.uid());

CREATE POLICY "Users can update own profile" 
ON profiles 
FOR UPDATE 
USING (id = auth.uid());

-- Update user role enum to remove master and admin roles
ALTER TYPE user_role RENAME TO user_role_old;
CREATE TYPE user_role AS ENUM ('customer', 'admin');

-- Update profiles table to use new enum
ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING 
  CASE 
    WHEN role::text = 'master' THEN 'admin'::user_role
    WHEN role::text = 'admin' THEN 'admin'::user_role
    ELSE 'customer'::user_role
  END;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'customer'::user_role;

-- Drop old enum
DROP TYPE user_role_old;