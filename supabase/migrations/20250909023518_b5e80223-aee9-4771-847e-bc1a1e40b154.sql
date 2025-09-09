-- Remove multi-tenant system completely

-- Drop all existing RLS policies first
DROP POLICY IF EXISTS "Anyone can view active products" ON products;
DROP POLICY IF EXISTS "Authenticated users can manage products" ON products;
DROP POLICY IF EXISTS "Users can manage tenant products" ON products;
DROP POLICY IF EXISTS "Anyone can view active tenant products" ON products;

DROP POLICY IF EXISTS "Authenticated users can manage orders" ON orders;
DROP POLICY IF EXISTS "Users can manage tenant orders" ON orders;
DROP POLICY IF EXISTS "Users can view tenant orders" ON orders;

DROP POLICY IF EXISTS "Authenticated users can manage customers" ON customers;
DROP POLICY IF EXISTS "Users can manage tenant customers" ON customers;
DROP POLICY IF EXISTS "Users can view tenant customers" ON customers;

DROP POLICY IF EXISTS "Authenticated users can manage carts" ON carts;
DROP POLICY IF EXISTS "Users can manage tenant carts" ON carts;

DROP POLICY IF EXISTS "Authenticated users can manage cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can manage tenant cart items" ON cart_items;

DROP POLICY IF EXISTS "Authenticated users can manage coupons" ON coupons;
DROP POLICY IF EXISTS "Anyone can view active coupons" ON coupons;
DROP POLICY IF EXISTS "Users can manage tenant coupons" ON coupons;
DROP POLICY IF EXISTS "Users can view tenant active coupons" ON coupons;

DROP POLICY IF EXISTS "Authenticated users can manage gifts" ON gifts;
DROP POLICY IF EXISTS "Anyone can view active gifts" ON gifts;
DROP POLICY IF EXISTS "Users can manage tenant gifts" ON gifts;
DROP POLICY IF EXISTS "Users can view tenant active gifts" ON gifts;

DROP POLICY IF EXISTS "Authenticated users can manage whatsapp messages" ON whatsapp_messages;
DROP POLICY IF EXISTS "Users can manage tenant whatsapp messages" ON whatsapp_messages;

DROP POLICY IF EXISTS "Authenticated users can manage whatsapp templates" ON whatsapp_templates;
DROP POLICY IF EXISTS "Users can manage tenant templates" ON whatsapp_templates;
DROP POLICY IF EXISTS "Users can view tenant templates" ON whatsapp_templates;

DROP POLICY IF EXISTS "Authenticated users can manage frete config" ON frete_config;
DROP POLICY IF EXISTS "Users can manage tenant frete config" ON frete_config;

DROP POLICY IF EXISTS "Authenticated users can manage frete cotacoes" ON frete_cotacoes;
DROP POLICY IF EXISTS "Users can manage tenant frete cotacoes" ON frete_cotacoes;

DROP POLICY IF EXISTS "Authenticated users can manage frete envios" ON frete_envios;
DROP POLICY IF EXISTS "Users can manage tenant frete envios" ON frete_envios;

DROP POLICY IF EXISTS "Authenticated users can manage customer tags" ON customer_tags;
DROP POLICY IF EXISTS "Users can manage tenant customer tags" ON customer_tags;

DROP POLICY IF EXISTS "Authenticated users can manage customer tag assignments" ON customer_tag_assignments;
DROP POLICY IF EXISTS "Users can manage tenant customer tag assignments" ON customer_tag_assignments;

DROP POLICY IF EXISTS "Authenticated users can manage customer whatsapp groups" ON customer_whatsapp_groups;
DROP POLICY IF EXISTS "Users can manage tenant customer whatsapp groups" ON customer_whatsapp_groups;

DROP POLICY IF EXISTS "Authenticated users can view webhook logs" ON webhook_logs;
DROP POLICY IF EXISTS "System can insert webhook logs" ON webhook_logs;
DROP POLICY IF EXISTS "Users can view tenant webhook logs" ON webhook_logs;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Masters can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Masters can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view tenant profiles" ON profiles;

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

-- Update user role enum to remove master and admin roles
DO $$
BEGIN
  -- Check if we need to handle the enum change
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- Create new enum
    CREATE TYPE user_role_new AS ENUM ('customer', 'admin');
    
    -- Update table to use new enum, converting master/admin to admin, others to customer
    ALTER TABLE profiles 
    ALTER COLUMN role TYPE user_role_new 
    USING CASE 
      WHEN role::text IN ('master', 'admin') THEN 'admin'::user_role_new
      ELSE 'customer'::user_role_new
    END;
    
    -- Drop old enum and rename new one
    DROP TYPE user_role;
    ALTER TYPE user_role_new RENAME TO user_role;
  END IF;
END $$;

-- Set default for role column
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'customer'::user_role;

-- Create simple RLS policies for basic auth

-- Products policies
CREATE POLICY "Anyone can view active products" 
ON products 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can manage products" 
ON products 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Orders policies
CREATE POLICY "Authenticated users can manage orders" 
ON orders 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Customers policies
CREATE POLICY "Authenticated users can manage customers" 
ON customers 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Carts policies
CREATE POLICY "Authenticated users can manage carts" 
ON carts 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Cart items policies
CREATE POLICY "Authenticated users can manage cart items" 
ON cart_items 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Coupons policies
CREATE POLICY "Authenticated users can manage coupons" 
ON coupons 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view active coupons" 
ON coupons 
FOR SELECT 
USING (is_active = true);

-- Gifts policies
CREATE POLICY "Authenticated users can manage gifts" 
ON gifts 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view active gifts" 
ON gifts 
FOR SELECT 
USING (is_active = true);

-- WhatsApp messages policies
CREATE POLICY "Authenticated users can manage whatsapp messages" 
ON whatsapp_messages 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- WhatsApp templates policies
CREATE POLICY "Authenticated users can manage whatsapp templates" 
ON whatsapp_templates 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Frete config policies
CREATE POLICY "Authenticated users can manage frete config" 
ON frete_config 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Frete cotacoes policies
CREATE POLICY "Authenticated users can manage frete cotacoes" 
ON frete_cotacoes 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Frete envios policies
CREATE POLICY "Authenticated users can manage frete envios" 
ON frete_envios 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Customer tags policies
CREATE POLICY "Authenticated users can manage customer tags" 
ON customer_tags 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Customer tag assignments policies
CREATE POLICY "Authenticated users can manage customer tag assignments" 
ON customer_tag_assignments 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Customer whatsapp groups policies
CREATE POLICY "Authenticated users can manage customer whatsapp groups" 
ON customer_whatsapp_groups 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Webhook logs policies
CREATE POLICY "Authenticated users can view webhook logs" 
ON webhook_logs 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can insert webhook logs" 
ON webhook_logs 
FOR INSERT 
WITH CHECK (true);

-- Profiles policies
CREATE POLICY "Users can view own profile" 
ON profiles 
FOR SELECT 
USING (id = auth.uid());

CREATE POLICY "Users can update own profile" 
ON profiles 
FOR UPDATE 
USING (id = auth.uid());