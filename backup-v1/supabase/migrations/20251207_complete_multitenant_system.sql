-- =====================================================
-- MIGRATION: Sistema Multi-Tenant COMPLETO
-- =====================================================
-- Data: 2025-12-07
-- Descrição: Implementa isolamento completo por tenant
--            usando tabelas compartilhadas com tenant_id
-- =====================================================

-- =====================================================
-- PARTE 1: GARANTIR QUE TABELA TENANTS ESTÁ OK
-- =====================================================

-- Adicionar campos que podem estar faltando na tabela tenants
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS subdomain TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#10B981',
ADD COLUMN IF NOT EXISTS enable_live BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_sendflow BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS slug TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS max_orders INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Criar índices na tabela tenants
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active) WHERE is_active = true;

-- =====================================================
-- PARTE 2: ADICIONAR tenant_id EM TODAS AS TABELAS
-- =====================================================

-- Tabelas de clientes e relacionados
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE customer_tag_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE customer_whatsapp_groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de produtos e relacionados
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de pedidos e relacionados
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de carrinho
ALTER TABLE carts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de cupons e promoções
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE coupon_usage ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de frete
ALTER TABLE frete_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE frete_cotacoes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE frete_envios ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de WhatsApp
ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de sorteio
ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sorteio_participantes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sorteio_ganhadores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de etiquetas
ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE etiqueta_prints ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de relatórios e analytics
ALTER TABLE reports ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sales_metrics ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de pagamento (Mercado Pago)
ALTER TABLE mercadopago_integrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE mercadopago_payments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE mercadopago_webhooks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de envio (Melhor Envio)
ALTER TABLE melhorenvio_integrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE melhorenvio_shipments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE melhorenvio_tracking ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de notificações
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de auditoria e logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tabelas de configuração
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sms_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- =====================================================
-- PARTE 3: CRIAR ÍNDICES COMPOSTOS PARA PERFORMANCE
-- =====================================================

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers(tenant_id, email);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON products(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_tenant_category ON products(tenant_id, category_id);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_customer ON orders(tenant_id, customer_id);

-- Carts
CREATE INDEX IF NOT EXISTS idx_carts_tenant ON carts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_items_tenant ON cart_items(tenant_id, cart_id);

-- WhatsApp
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant ON whatsapp_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_tenant ON whatsapp_connections(tenant_id);

-- Coupons
CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coupon_usage_tenant ON coupon_usage(tenant_id, coupon_id);

-- Sorteios
CREATE INDEX IF NOT EXISTS idx_sorteios_tenant ON sorteios(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sorteio_participantes_tenant ON sorteio_participantes(tenant_id, sorteio_id);

-- =====================================================
-- PARTE 4: HABILITAR RLS EM TODAS AS TABELAS
-- =====================================================

-- Customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- Products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- Orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Carts
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Coupons
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

-- Frete
ALTER TABLE frete_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE frete_cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE frete_envios ENABLE ROW LEVEL SECURITY;

-- WhatsApp
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- Sorteios
ALTER TABLE sorteios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteio_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteio_ganhadores ENABLE ROW LEVEL SECURITY;

-- Etiquetas
ALTER TABLE etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE etiqueta_prints ENABLE ROW LEVEL SECURITY;

-- Reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_metrics ENABLE ROW LEVEL SECURITY;

-- Pagamentos
ALTER TABLE mercadopago_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadopago_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadopago_webhooks ENABLE ROW LEVEL SECURITY;

-- Envios
ALTER TABLE melhorenvio_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE melhorenvio_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE melhorenvio_tracking ENABLE ROW LEVEL SECURITY;

-- Notificações
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

-- Logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Configurações
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PARTE 5: CRIAR FUNÇÃO AUXILIAR PARA PEGAR TENANT_ID
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id 
    FROM profiles 
    WHERE id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PARTE 6: CRIAR RLS POLICIES PADRÃO (TEMPLATE)
-- =====================================================

-- IMPORTANTE: Este é um template. Você precisa criar policies 
-- específicas para cada tabela seguindo este padrão:

-- Exemplo para tabela customers:
DROP POLICY IF EXISTS "tenant_isolation_customers_select" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_insert" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_update" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_delete" ON customers;

CREATE POLICY "tenant_isolation_customers_select" ON customers
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_customers_insert" ON customers
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_customers_update" ON customers
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_customers_delete" ON customers
  FOR DELETE USING (tenant_id = get_user_tenant_id());

-- Exemplo para tabela products:
DROP POLICY IF EXISTS "tenant_isolation_products_select" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_insert" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_update" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_delete" ON products;

CREATE POLICY "tenant_isolation_products_select" ON products
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_products_insert" ON products
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_products_update" ON products
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_products_delete" ON products
  FOR DELETE USING (tenant_id = get_user_tenant_id());

-- Exemplo para tabela orders:
DROP POLICY IF EXISTS "tenant_isolation_orders_select" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_insert" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_update" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_delete" ON orders;

CREATE POLICY "tenant_isolation_orders_select" ON orders
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_orders_insert" ON orders
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_orders_update" ON orders
  FOR UPDATE USING (tenant_id = get_user_tenant_id());

CREATE POLICY "tenant_isolation_orders_delete" ON orders
  FOR DELETE USING (tenant_id = get_user_tenant_id());

-- =====================================================
-- PARTE 7: POLICIES PÚBLICAS (PARA CHECKOUT/CARRINHO)
-- =====================================================

-- Permitir acesso público a produtos (para clientes visualizarem)
DROP POLICY IF EXISTS "public_can_view_products" ON products;
CREATE POLICY "public_can_view_products" ON products
  FOR SELECT USING (is_active = true);

-- Permitir criar carrinho sem autenticação
DROP POLICY IF EXISTS "anyone_can_create_cart" ON carts;
CREATE POLICY "anyone_can_create_cart" ON carts
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anyone_can_view_own_cart" ON carts;
CREATE POLICY "anyone_can_view_own_cart" ON carts
  FOR SELECT USING (true);

-- =====================================================
-- PARTE 8: FUNÇÃO PARA VALIDAR ACESSO DO TENANT
-- =====================================================

CREATE OR REPLACE FUNCTION tenant_has_access(tenant_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  tenant_record RECORD;
BEGIN
  SELECT * INTO tenant_record FROM tenants WHERE id = tenant_uuid;
  
  IF NOT FOUND OR tenant_record.is_blocked THEN
    RETURN FALSE;
  END IF;
  
  IF tenant_record.plan_type IN ('free', 'enterprise') THEN
    RETURN TRUE;
  END IF;
  
  IF tenant_record.trial_ends_at IS NOT NULL AND tenant_record.trial_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  IF tenant_record.subscription_ends_at IS NOT NULL AND tenant_record.subscription_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PARTE 9: TRIGGER PARA AUTO-PREENCHER tenant_id
-- =====================================================

CREATE OR REPLACE FUNCTION auto_set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em tabelas principais
DROP TRIGGER IF EXISTS set_tenant_id_customers ON customers;
CREATE TRIGGER set_tenant_id_customers
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

DROP TRIGGER IF EXISTS set_tenant_id_products ON products;
CREATE TRIGGER set_tenant_id_products
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

DROP TRIGGER IF EXISTS set_tenant_id_orders ON orders;
CREATE TRIGGER set_tenant_id_orders
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- =====================================================
-- PARTE 10: VIEW DE MONITORAMENTO
-- =====================================================

CREATE OR REPLACE VIEW tenant_usage_stats AS
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  t.plan_type,
  t.is_blocked,
  tenant_has_access(t.id) as has_access,
  COUNT(DISTINCT c.id) as total_customers,
  COUNT(DISTINCT p.id) as total_products,
  COUNT(DISTINCT o.id) as total_orders,
  COALESCE(SUM(o.total), 0) as total_revenue
FROM tenants t
LEFT JOIN customers c ON c.tenant_id = t.id
LEFT JOIN products p ON p.tenant_id = t.id
LEFT JOIN orders o ON o.tenant_id = t.id
GROUP BY t.id, t.name, t.plan_type, t.is_blocked;

-- =====================================================
-- PARTE 11: COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON FUNCTION get_user_tenant_id() IS 'Retorna o tenant_id do usuário logado';
COMMENT ON FUNCTION tenant_has_access(UUID) IS 'Verifica se um tenant tem acesso ativo ao sistema';
COMMENT ON FUNCTION auto_set_tenant_id() IS 'Preenche automaticamente tenant_id com base no usuário logado';
COMMENT ON VIEW tenant_usage_stats IS 'Estatísticas de uso por tenant';

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================

-- PRÓXIMOS PASSOS APÓS EXECUTAR:
-- 
-- 1. Associar usuários aos tenants:
--    UPDATE profiles SET tenant_id = 'uuid-do-tenant' WHERE email = 'usuario@email.com';
--
-- 2. Migrar dados existentes (se houver):
--    UPDATE customers SET tenant_id = 'uuid-do-tenant-master' WHERE tenant_id IS NULL;
--    UPDATE products SET tenant_id = 'uuid-do-tenant-master' WHERE tenant_id IS NULL;
--    UPDATE orders SET tenant_id = 'uuid-do-tenant-master' WHERE tenant_id IS NULL;
--
-- 3. Tornar tenant_id obrigatório (depois de migrar dados):
--    ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
--    ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
--    ALTER TABLE orders ALTER COLUMN tenant_id SET NOT NULL;
--
-- 4. Fazer redeploy no Railway
-- 
-- 5. Testar isolamento:
--    - Login como Tenant A → deve ver só dados do Tenant A
--    - Login como Tenant B → deve ver só dados do Tenant B
