-- ============================================================
-- ORDERZAP V2 - DATABASE SCHEMA (SUPABASE/POSTGRESQL)
-- ============================================================
-- Execute este SQL no Supabase SQL Editor
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELAS
-- ============================================================

-- Tenants (Lojas)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  settings JSONB DEFAULT '{}',
  whatsapp_connected BOOLEAN DEFAULT false,
  plan TEXT DEFAULT 'free',  -- free, pro, enterprise
  status TEXT DEFAULT 'active',  -- active, suspended, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para tenants
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_owner_id ON tenants(owner_id);

-- Usuários por Tenant (multi-tenant user access)
CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- Índices para tenant_users
CREATE INDEX idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user_id ON tenant_users(user_id);

-- Produtos
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  cost DECIMAL(10, 2),
  stock INT DEFAULT 0 CHECK (stock >= 0),
  sku TEXT,
  barcode TEXT,
  images JSONB DEFAULT '[]',
  category TEXT,
  tags TEXT[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para products
CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

-- Clientes
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  cpf_cnpj TEXT,
  address JSONB DEFAULT '{}',
  notes TEXT,
  tags TEXT[],
  total_orders INT DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para customers
CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_whatsapp ON customers(whatsapp) WHERE whatsapp IS NOT NULL;

-- Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(10, 2) DEFAULT 0,
  shipping DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  items JSONB NOT NULL,
  customer_info JSONB,  -- Snapshot dos dados do cliente
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  shipping_method TEXT,
  tracking_code TEXT,
  notes TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para orders
CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_number ON orders(order_number);

-- WhatsApp Sessions
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  qr_code TEXT,
  connected BOOLEAN DEFAULT false,
  phone_number TEXT,
  last_seen TIMESTAMPTZ,
  connection_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para whatsapp_sessions
CREATE INDEX idx_whatsapp_sessions_tenant_id ON whatsapp_sessions(tenant_id);

-- WhatsApp Messages (histórico)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  message_id TEXT UNIQUE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,
  type TEXT DEFAULT 'text',  -- text, image, document, audio, video
  status TEXT DEFAULT 'sent',  -- sent, delivered, read, failed
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para whatsapp_messages
CREATE INDEX idx_whatsapp_messages_tenant_id ON whatsapp_messages(tenant_id);
CREATE INDEX idx_whatsapp_messages_from ON whatsapp_messages(from_number);
CREATE INDEX idx_whatsapp_messages_to ON whatsapp_messages(to_number);
CREATE INDEX idx_whatsapp_messages_created_at ON whatsapp_messages(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES
-- ============================================================

-- Tenants: Usuário vê tenants onde ele está como membro
CREATE POLICY "Users can view their tenants"
ON tenants FOR SELECT
USING (
  id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update their tenants"
ON tenants FOR UPDATE
USING (
  id IN (
    SELECT tenant_id FROM tenant_users 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Tenant Users: Usuário vê membros dos seus tenants
CREATE POLICY "Users can view tenant members"
ON tenant_users FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

-- Products: Usuário vê produtos dos seus tenants
CREATE POLICY "Users can view tenant products"
ON products FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert tenant products"
ON products FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update tenant products"
ON products FOR UPDATE
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete tenant products"
ON products FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Customers: Similar aos products
CREATE POLICY "Users can view tenant customers"
ON customers FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert tenant customers"
ON customers FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update tenant customers"
ON customers FOR UPDATE
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete tenant customers"
ON customers FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Orders: Similar aos products
CREATE POLICY "Users can view tenant orders"
ON orders FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert tenant orders"
ON orders FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update tenant orders"
ON orders FOR UPDATE
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

-- WhatsApp Sessions: Apenas owner/admin pode gerenciar
CREATE POLICY "Users can view tenant whatsapp"
ON whatsapp_sessions FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can manage tenant whatsapp"
ON whatsapp_sessions FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- WhatsApp Messages: Todos podem ver, apenas sistema insere
CREATE POLICY "Users can view tenant messages"
ON whatsapp_messages FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Função para gerar número de pedido único
CREATE OR REPLACE FUNCTION generate_order_number(tenant_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  next_number INT;
  order_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+$') AS INT)), 0) + 1
  INTO next_number
  FROM orders
  WHERE tenant_id = tenant_uuid;
  
  order_num := 'ORD-' || LPAD(next_number::TEXT, 6, '0');
  RETURN order_num;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger para updated_at em tenants
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at em products
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at em customers
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at em orders
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at em whatsapp_sessions
CREATE TRIGGER update_whatsapp_sessions_updated_at
BEFORE UPDATE ON whatsapp_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DADOS INICIAIS (OPCIONAL)
-- ============================================================

-- Você pode adicionar dados de exemplo aqui se quiser

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
