-- Migration: Sistema de Integração Multi-Tenant
-- Adiciona suporte robusto para integrações de pagamento (Mercado Pago) e envio (Melhor Envio) por tenant

-- =====================================================
-- 1. TABELA: tenant_payment_integrations
-- Gerencia integrações de pagamento por tenant
-- =====================================================
CREATE TABLE IF NOT EXISTS tenant_payment_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Tipo de integração
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('mercado_pago', 'stripe', 'paypal')),
  
  -- Credenciais (criptografadas)
  access_token TEXT,
  public_key TEXT,
  refresh_token TEXT,
  
  -- Configurações adicionais (JSON)
  config JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  is_active BOOLEAN DEFAULT false,
  is_sandbox BOOLEAN DEFAULT true,
  
  -- Webhooks
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Metadados
  last_verified_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: apenas uma integração ativa por provider por tenant
  UNIQUE(tenant_id, provider)
);

-- Index para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_payment_integrations_tenant ON tenant_payment_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_integrations_active ON tenant_payment_integrations(tenant_id, is_active) WHERE is_active = true;

-- =====================================================
-- 2. TABELA: tenant_shipping_integrations
-- Gerencia integrações de envio por tenant
-- =====================================================
CREATE TABLE IF NOT EXISTS tenant_shipping_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Tipo de integração
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('melhor_envio', 'correios', 'jadlog', 'custom')),
  
  -- Credenciais
  api_token TEXT,
  client_id TEXT,
  client_secret TEXT,
  
  -- Configurações do remetente
  sender_config JSONB DEFAULT '{}'::jsonb,
  -- Exemplo: {
  --   "name": "Nome da Empresa",
  --   "phone": "11999999999",
  --   "email": "empresa@example.com",
  --   "document": "12345678000100",
  --   "address": {
  --     "postal_code": "01310-100",
  --     "street": "Avenida Paulista",
  --     "number": "1578",
  --     "complement": "Andar 5",
  --     "district": "Bela Vista",
  --     "city": "São Paulo",
  --     "state": "SP"
  --   }
  -- }
  
  -- Configurações adicionais
  config JSONB DEFAULT '{}'::jsonb,
  -- Exemplo: {
  --   "default_services": ["SEDEX", "PAC"],
  --   "insurance_enabled": true,
  --   "own_hand_enabled": false,
  --   "collect_enabled": false
  -- }
  
  -- Status
  is_active BOOLEAN DEFAULT false,
  is_sandbox BOOLEAN DEFAULT true,
  
  -- Saldo e limite (para Melhor Envio)
  balance_cents INTEGER DEFAULT 0,
  
  -- Webhooks
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Metadados
  last_verified_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: apenas uma integração ativa por provider por tenant
  UNIQUE(tenant_id, provider)
);

-- Index para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_shipping_integrations_tenant ON tenant_shipping_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipping_integrations_active ON tenant_shipping_integrations(tenant_id, is_active) WHERE is_active = true;

-- =====================================================
-- 3. TABELA: payment_transactions
-- Registra todas as transações de pagamento
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES tenant_payment_integrations(id) ON DELETE SET NULL,
  
  -- Identificadores externos
  external_id VARCHAR(255),
  external_status VARCHAR(100),
  
  -- Informações da transação
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  description TEXT,
  
  -- Relacionamento com pedido
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Status interno
  status VARCHAR(50) NOT NULL CHECK (status IN (
    'pending', 'processing', 'approved', 'rejected', 
    'cancelled', 'refunded', 'chargeback'
  )),
  
  -- Dados adicionais (JSON)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_external ON payment_transactions(external_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(tenant_id, status);

-- =====================================================
-- 4. TABELA: shipping_orders
-- Registra todos os envios
-- =====================================================
CREATE TABLE IF NOT EXISTS shipping_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES tenant_shipping_integrations(id) ON DELETE SET NULL,
  
  -- Identificadores externos
  external_id VARCHAR(255),
  tracking_code VARCHAR(255),
  
  -- Informações do envio
  service_name VARCHAR(100),
  service_code VARCHAR(50),
  
  -- Valores
  price_cents INTEGER,
  declared_value_cents INTEGER,
  
  -- Relacionamento com pedido
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Endereços
  from_address JSONB,
  to_address JSONB NOT NULL,
  
  -- Dimensões e peso do pacote
  package_info JSONB DEFAULT '{}'::jsonb,
  -- Exemplo: {
  --   "weight": 0.5,
  --   "length": 20,
  --   "width": 15,
  --   "height": 10
  -- }
  
  -- Status
  status VARCHAR(50) NOT NULL CHECK (status IN (
    'pending', 'quoted', 'purchased', 'posted', 
    'in_transit', 'delivered', 'cancelled', 'failed'
  )),
  
  -- Dados adicionais
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  posted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shipping_orders_tenant ON shipping_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipping_orders_order ON shipping_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_orders_tracking ON shipping_orders(tracking_code);
CREATE INDEX IF NOT EXISTS idx_shipping_orders_status ON shipping_orders(tenant_id, status);

-- =====================================================
-- 5. TABELA: integration_logs
-- Registra logs de todas as integrações
-- =====================================================
CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Tipo de integração
  integration_type VARCHAR(50) NOT NULL CHECK (integration_type IN ('payment', 'shipping', 'whatsapp')),
  integration_id UUID,
  
  -- Tipo de evento
  event_type VARCHAR(100) NOT NULL,
  
  -- Detalhes
  request_data JSONB,
  response_data JSONB,
  error_message TEXT,
  
  -- Status
  success BOOLEAN DEFAULT true,
  
  -- HTTP info
  http_status INTEGER,
  http_method VARCHAR(10),
  endpoint TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant ON integration_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_type ON integration_logs(integration_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at DESC);

-- =====================================================
-- 6. RLS (Row Level Security) Policies
-- =====================================================

-- Habilitar RLS
ALTER TABLE tenant_payment_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_shipping_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para tenant_payment_integrations
CREATE POLICY "Users can view their tenant payment integrations"
  ON tenant_payment_integrations FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Admins can manage their tenant payment integrations"
  ON tenant_payment_integrations FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Políticas para tenant_shipping_integrations
CREATE POLICY "Users can view their tenant shipping integrations"
  ON tenant_shipping_integrations FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Admins can manage their tenant shipping integrations"
  ON tenant_shipping_integrations FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Políticas para payment_transactions
CREATE POLICY "Users can view their tenant payment transactions"
  ON payment_transactions FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "System can manage payment transactions"
  ON payment_transactions FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- Políticas para shipping_orders
CREATE POLICY "Users can view their tenant shipping orders"
  ON shipping_orders FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can manage their tenant shipping orders"
  ON shipping_orders FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- Políticas para integration_logs
CREATE POLICY "Users can view their tenant integration logs"
  ON integration_logs FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "System can insert integration logs"
  ON integration_logs FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- =====================================================
-- 7. Funções auxiliares
-- =====================================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_tenant_payment_integrations_updated_at
  BEFORE UPDATE ON tenant_payment_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_shipping_integrations_updated_at
  BEFORE UPDATE ON tenant_shipping_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipping_orders_updated_at
  BEFORE UPDATE ON shipping_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. Comentários nas tabelas
-- =====================================================

COMMENT ON TABLE tenant_payment_integrations IS 'Gerencia integrações de pagamento (Mercado Pago, Stripe, etc) por tenant';
COMMENT ON TABLE tenant_shipping_integrations IS 'Gerencia integrações de envio (Melhor Envio, Correios, etc) por tenant';
COMMENT ON TABLE payment_transactions IS 'Registra todas as transações de pagamento';
COMMENT ON TABLE shipping_orders IS 'Registra todos os pedidos de envio';
COMMENT ON TABLE integration_logs IS 'Logs de todas as operações de integração';
