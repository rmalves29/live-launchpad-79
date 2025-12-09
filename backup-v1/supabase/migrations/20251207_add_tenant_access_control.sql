-- Migration: Controle de Acesso e Prazo para Tenants
-- Permite administrador definir prazo de acesso e bloquear tenants

-- Adicionar campos de controle de acesso
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'trial';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 5;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT 100;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_orders_per_month INTEGER DEFAULT 1000;

-- Adicionar campos de contato/responsável
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_document VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notes TEXT;

-- Criar índices para buscas
CREATE INDEX IF NOT EXISTS idx_tenants_trial_ends ON tenants(trial_ends_at) WHERE trial_ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_ends ON tenants(subscription_ends_at) WHERE subscription_ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_is_blocked ON tenants(is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);

-- Função para verificar se tenant tem acesso
CREATE OR REPLACE FUNCTION tenant_has_access(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_tenant RECORD;
BEGIN
  SELECT 
    is_active,
    is_blocked,
    trial_ends_at,
    subscription_ends_at
  INTO v_tenant
  FROM tenants
  WHERE id = p_tenant_id;
  
  -- Se não encontrou ou está inativo
  IF NOT FOUND OR NOT v_tenant.is_active THEN
    RETURN FALSE;
  END IF;
  
  -- Se está bloqueado
  IF v_tenant.is_blocked THEN
    RETURN FALSE;
  END IF;
  
  -- Se trial expirou e não tem subscription
  IF v_tenant.trial_ends_at IS NOT NULL 
     AND v_tenant.trial_ends_at < NOW() 
     AND (v_tenant.subscription_ends_at IS NULL OR v_tenant.subscription_ends_at < NOW()) THEN
    RETURN FALSE;
  END IF;
  
  -- Se subscription expirou
  IF v_tenant.subscription_ends_at IS NOT NULL 
     AND v_tenant.subscription_ends_at < NOW() THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View para ver status de acesso dos tenants
CREATE OR REPLACE VIEW tenants_access_status AS
SELECT 
  t.id,
  t.name,
  t.slug,
  t.email,
  t.is_active,
  t.is_blocked,
  t.blocked_reason,
  t.trial_ends_at,
  t.subscription_ends_at,
  t.plan,
  t.contact_name,
  t.contact_phone,
  t.created_at,
  t.updated_at,
  -- Status calculado
  CASE 
    WHEN NOT t.is_active THEN 'inactive'
    WHEN t.is_blocked THEN 'blocked'
    WHEN t.trial_ends_at IS NOT NULL AND t.trial_ends_at < NOW() 
         AND (t.subscription_ends_at IS NULL OR t.subscription_ends_at < NOW()) THEN 'trial_expired'
    WHEN t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at < NOW() THEN 'subscription_expired'
    WHEN t.trial_ends_at IS NOT NULL AND t.trial_ends_at > NOW() THEN 'trial_active'
    WHEN t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at > NOW() THEN 'subscription_active'
    ELSE 'active'
  END as access_status,
  -- Dias restantes
  CASE 
    WHEN t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at > NOW() THEN 
      EXTRACT(DAY FROM t.subscription_ends_at - NOW())::INTEGER
    WHEN t.trial_ends_at IS NOT NULL AND t.trial_ends_at > NOW() THEN 
      EXTRACT(DAY FROM t.trial_ends_at - NOW())::INTEGER
    ELSE NULL
  END as days_remaining,
  -- Total de usuários
  (SELECT COUNT(*) FROM profiles WHERE tenant_id = t.id) as total_users
FROM tenants t;

-- Comentários
COMMENT ON COLUMN tenants.trial_ends_at IS 'Data de término do período de teste';
COMMENT ON COLUMN tenants.subscription_ends_at IS 'Data de término da assinatura paga';
COMMENT ON COLUMN tenants.is_blocked IS 'Se true, tenant está bloqueado (não pode acessar)';
COMMENT ON COLUMN tenants.blocked_reason IS 'Motivo do bloqueio';
COMMENT ON COLUMN tenants.plan IS 'Plano do tenant: trial, basic, pro, enterprise';
COMMENT ON COLUMN tenants.max_users IS 'Número máximo de usuários permitidos';
COMMENT ON COLUMN tenants.max_products IS 'Número máximo de produtos permitidos';
COMMENT ON COLUMN tenants.max_orders_per_month IS 'Número máximo de pedidos por mês';

-- Atualizar tenants existentes com trial de 30 dias
UPDATE tenants 
SET trial_ends_at = NOW() + INTERVAL '30 days',
    plan = 'trial'
WHERE trial_ends_at IS NULL AND is_active = true;
