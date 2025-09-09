-- Drop existing triggers and functions if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS get_current_tenant_id() CASCADE;
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;

-- Check and drop existing types if needed to avoid conflicts
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS cart_status CASCADE;
DROP TYPE IF EXISTS whatsapp_template_type CASCADE;
DROP TYPE IF EXISTS whatsapp_message_type CASCADE;

-- Drop existing tables if they exist to ensure clean setup
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS webhook_logs CASCADE;
DROP TABLE IF EXISTS customer_whatsapp_groups CASCADE;
DROP TABLE IF EXISTS whatsapp_messages CASCADE;
DROP TABLE IF EXISTS whatsapp_templates CASCADE;
DROP TABLE IF EXISTS shipping_integrations CASCADE;
DROP TABLE IF EXISTS payment_integrations CASCADE;
DROP TABLE IF EXISTS integration_whatsapp CASCADE;
DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS carts CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums for user roles and other types
CREATE TYPE user_role AS ENUM ('super_admin', 'tenant_admin', 'staff');
CREATE TYPE cart_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE whatsapp_template_type AS ENUM ('BROADCAST', 'ITEM_ADDED', 'PRODUCT_CANCELED', 'PAID_ORDER');
CREATE TYPE whatsapp_message_type AS ENUM ('incoming', 'outgoing', 'broadcast', 'system_log');

-- Tenants table (companies)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Profiles table (extends auth.users with tenant info)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    role user_role NOT NULL DEFAULT 'staff',
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Products table
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id, code)
);

-- Customers table
CREATE TABLE customers (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    cpf TEXT,
    street TEXT,
    number TEXT,
    complement TEXT,
    city TEXT,
    state TEXT,
    cep TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id, phone)
);

-- Carts table
CREATE TABLE carts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_type TEXT NOT NULL,
    customer_instagram TEXT,
    status cart_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Cart items table
CREATE TABLE cart_items (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cart_id BIGINT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    printed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Orders table
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cart_id BIGINT REFERENCES carts(id) ON DELETE SET NULL,
    customer_phone TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_type TEXT NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT false,
    payment_link TEXT,
    observation TEXT,
    whatsapp_group_name TEXT,
    printed BOOLEAN DEFAULT false,
    item_added_message_sent BOOLEAN DEFAULT false,
    payment_confirmation_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- WhatsApp integration mapping
CREATE TABLE integration_whatsapp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_name TEXT UNIQUE NOT NULL,
    webhook_secret TEXT NOT NULL,
    api_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Payment integrations (Mercado Pago)
CREATE TABLE payment_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'mercado_pago',
    access_token TEXT NOT NULL,
    public_key TEXT,
    client_id TEXT,
    client_secret TEXT,
    webhook_secret TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Shipping integrations (Melhor Envio)
CREATE TABLE shipping_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'melhor_envio',
    access_token TEXT NOT NULL,
    client_id TEXT,
    client_secret TEXT,
    sandbox BOOLEAN NOT NULL DEFAULT true,
    webhook_secret TEXT,
    from_cep TEXT DEFAULT '31575060',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- WhatsApp templates
CREATE TABLE whatsapp_templates (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type whatsapp_template_type NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- WhatsApp messages log
CREATE TABLE whatsapp_messages (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    type whatsapp_message_type NOT NULL,
    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    product_name TEXT,
    amount NUMERIC(10,2),
    whatsapp_group_name TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Customer WhatsApp groups mapping
CREATE TABLE customer_whatsapp_groups (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    whatsapp_group_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Webhook logs
CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    webhook_type TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    payload JSONB,
    response TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tenant tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create helper function to get current user's tenant_id
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT tenant_id 
        FROM profiles 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create helper function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT role = 'super_admin'
        FROM profiles 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS Policies

-- Tenants: super_admin can see all, others see their own
CREATE POLICY "Super admin can manage all tenants" ON tenants
    FOR ALL USING (is_super_admin());

CREATE POLICY "Users can view their own tenant" ON tenants
    FOR SELECT USING (id = get_current_tenant_id());

-- Profiles: super_admin sees all, users see own tenant
CREATE POLICY "Super admin can manage all profiles" ON profiles
    FOR ALL USING (is_super_admin());

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (id = auth.uid());

-- Products: tenant isolation
CREATE POLICY "Super admin can manage all products" ON products
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their products" ON products
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Customers: tenant isolation
CREATE POLICY "Super admin can manage all customers" ON customers
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their customers" ON customers
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Carts: tenant isolation
CREATE POLICY "Super admin can manage all carts" ON carts
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their carts" ON carts
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Cart items: tenant isolation
CREATE POLICY "Super admin can manage all cart items" ON cart_items
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their cart items" ON cart_items
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Orders: tenant isolation
CREATE POLICY "Super admin can manage all orders" ON orders
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their orders" ON orders
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Integration WhatsApp: tenant isolation
CREATE POLICY "Super admin can manage all whatsapp integrations" ON integration_whatsapp
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their whatsapp integrations" ON integration_whatsapp
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Payment integrations: tenant isolation
CREATE POLICY "Super admin can manage all payment integrations" ON payment_integrations
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their payment integrations" ON payment_integrations
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Shipping integrations: tenant isolation
CREATE POLICY "Super admin can manage all shipping integrations" ON shipping_integrations
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their shipping integrations" ON shipping_integrations
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- WhatsApp templates: tenant isolation
CREATE POLICY "Super admin can manage all whatsapp templates" ON whatsapp_templates
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their whatsapp templates" ON whatsapp_templates
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- WhatsApp messages: tenant isolation
CREATE POLICY "Super admin can manage all whatsapp messages" ON whatsapp_messages
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their whatsapp messages" ON whatsapp_messages
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Customer WhatsApp groups: tenant isolation
CREATE POLICY "Super admin can manage all customer whatsapp groups" ON customer_whatsapp_groups
    FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant users can manage their customer whatsapp groups" ON customer_whatsapp_groups
    FOR ALL USING (tenant_id = get_current_tenant_id());

-- Audit logs: tenant isolation
CREATE POLICY "Super admin can view all audit logs" ON audit_logs
    FOR SELECT USING (is_super_admin());

CREATE POLICY "Tenant users can view their audit logs" ON audit_logs
    FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT WITH CHECK (true);

-- Webhook logs: tenant isolation
CREATE POLICY "Super admin can view all webhook logs" ON webhook_logs
    FOR SELECT USING (is_super_admin());

CREATE POLICY "Tenant users can view their webhook logs" ON webhook_logs
    FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "System can insert webhook logs" ON webhook_logs
    FOR INSERT WITH CHECK (true);

-- Create trigger for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_whatsapp_updated_at BEFORE UPDATE ON integration_whatsapp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_integrations_updated_at BEFORE UPDATE ON payment_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipping_integrations_updated_at BEFORE UPDATE ON shipping_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON whatsapp_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_messages_updated_at BEFORE UPDATE ON whatsapp_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_whatsapp_groups_updated_at BEFORE UPDATE ON customer_whatsapp_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, role, tenant_id)
    VALUES (
        NEW.id,
        NEW.email,
        CASE 
            WHEN NEW.email = 'admin@system.com' THEN 'super_admin'::user_role
            ELSE 'staff'::user_role
        END,
        NULL -- Will be set later for tenant users
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Insert demo data
INSERT INTO tenants (id, name, slug) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Empresa Demo', 'demo'),
    ('22222222-2222-2222-2222-222222222222', 'Empresa Teste', 'teste');

-- Insert demo products for tenant demo
INSERT INTO products (tenant_id, code, name, price, stock) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'C001', 'Produto Demo 1', 29.90, 100),
    ('11111111-1111-1111-1111-111111111111', 'C002', 'Produto Demo 2', 49.90, 50),
    ('22222222-2222-2222-2222-222222222222', 'T001', 'Produto Teste 1', 19.90, 75),
    ('22222222-2222-2222-2222-222222222222', 'T002', 'Produto Teste 2', 39.90, 25);

-- Insert demo customers
INSERT INTO customers (tenant_id, name, phone) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Cliente Demo', '31987654321'),
    ('22222222-2222-2222-2222-222222222222', 'Cliente Teste', '11987654321');

-- Insert demo WhatsApp integrations
INSERT INTO integration_whatsapp (tenant_id, instance_name, webhook_secret, api_url) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'demo_instance', 'demo_secret_123', 'http://localhost:3001'),
    ('22222222-2222-2222-2222-222222222222', 'teste_instance', 'teste_secret_456', 'http://localhost:3002');

-- Insert demo WhatsApp templates
INSERT INTO whatsapp_templates (tenant_id, type, title, content) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'BROADCAST', 'Mensagem Broadcast', 'Olá! Esta é uma mensagem broadcast para todos os clientes.'),
    ('11111111-1111-1111-1111-111111111111', 'ITEM_ADDED', 'Item Adicionado', 'Produto {product_name} foi adicionado ao seu pedido. Total: R$ {amount}'),
    ('22222222-2222-2222-2222-222222222222', 'BROADCAST', 'Mensagem Teste', 'Mensagem de teste para empresa teste.');