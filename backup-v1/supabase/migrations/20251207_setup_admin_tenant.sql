-- =====================================================
-- MIGRATION: Setup Admin Tenant and Access Control
-- =====================================================
-- Descrição: Adiciona controle de acesso aos tenants e cria tenant APP master
-- Data: 2025-12-07
-- =====================================================

-- 1️⃣ Adicionar campos de controle de acesso na tabela tenants
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'trial' CHECK (plan_type IN ('trial', 'basic', 'premium', 'enterprise', 'free')),
ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS max_orders INTEGER DEFAULT 100;

-- 2️⃣ Criar função para verificar se tenant tem acesso ativo
CREATE OR REPLACE FUNCTION tenant_has_access(tenant_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  tenant_record RECORD;
BEGIN
  -- Buscar tenant
  SELECT * INTO tenant_record FROM tenants WHERE id = tenant_uuid;
  
  -- Se não existe ou está bloqueado, retornar false
  IF NOT FOUND OR tenant_record.is_blocked THEN
    RETURN FALSE;
  END IF;
  
  -- Se é plano free ou enterprise, retornar true (acesso ilimitado)
  IF tenant_record.plan_type IN ('free', 'enterprise') THEN
    RETURN TRUE;
  END IF;
  
  -- Se está em trial e ainda não expirou
  IF tenant_record.trial_ends_at IS NOT NULL AND tenant_record.trial_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  -- Se tem assinatura ativa e ainda não expirou
  IF tenant_record.subscription_ends_at IS NOT NULL AND tenant_record.subscription_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  -- Caso contrário, acesso expirado
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 3️⃣ Criar view para status dos tenants
CREATE OR REPLACE VIEW tenant_status AS
SELECT 
  t.id,
  t.name,
  t.subdomain,
  t.email,
  t.phone,
  t.plan_type,
  t.is_blocked,
  t.trial_ends_at,
  t.subscription_ends_at,
  t.max_products,
  t.max_orders,
  t.created_at,
  CASE
    WHEN t.is_blocked THEN 'blocked'
    WHEN t.plan_type = 'enterprise' THEN 'active'
    WHEN t.plan_type = 'free' THEN 'active'
    WHEN t.trial_ends_at > NOW() THEN 'trial'
    WHEN t.subscription_ends_at > NOW() THEN 'active'
    ELSE 'expired'
  END as status,
  tenant_has_access(t.id) as has_access,
  -- Contadores de uso
  (SELECT COUNT(*) FROM products WHERE tenant_id = t.id) as current_products,
  (SELECT COUNT(*) FROM orders WHERE tenant_id = t.id) as current_orders
FROM tenants t;

-- 4️⃣ Criar tenant APP (admin master)
INSERT INTO tenants (
  name,
  subdomain,
  email,
  phone,
  address,
  plan_type,
  is_blocked,
  max_products,
  max_orders
)
VALUES (
  'APP - Administração OrderZap',
  'app-admin',
  'admin@orderzaps.com',
  '00000000000',
  'Sistema',
  'enterprise',
  false,
  999999,
  999999
)
ON CONFLICT (subdomain) DO UPDATE
SET 
  plan_type = 'enterprise',
  is_blocked = false,
  max_products = 999999,
  max_orders = 999999
RETURNING id;

-- 5️⃣ Comentários e instruções
COMMENT ON COLUMN tenants.trial_ends_at IS 'Data de término do período trial';
COMMENT ON COLUMN tenants.subscription_ends_at IS 'Data de término da assinatura paga';
COMMENT ON COLUMN tenants.is_blocked IS 'Indica se o tenant está bloqueado manualmente';
COMMENT ON COLUMN tenants.plan_type IS 'Tipo de plano: trial, basic, premium, enterprise, free';
COMMENT ON COLUMN tenants.max_products IS 'Limite máximo de produtos cadastrados';
COMMENT ON COLUMN tenants.max_orders IS 'Limite máximo de pedidos por mês';

COMMENT ON FUNCTION tenant_has_access IS 'Verifica se um tenant tem acesso ativo ao sistema';
COMMENT ON VIEW tenant_status IS 'View com status consolidado de cada tenant';

-- =====================================================
-- PRÓXIMOS PASSOS:
-- =====================================================
-- 1. Após executar esta migration, execute:
--    SELECT id FROM tenants WHERE subdomain = 'app-admin';
--
-- 2. Com o UUID retornado, execute:
--    UPDATE profiles 
--    SET tenant_id = 'UUID-AQUI', role = 'super_admin'
--    WHERE email = 'rmalves21@hotmail.com';
--
-- 3. Fazer redeploy no Railway
--
-- 4. Testar login em https://orderzaps.com
-- =====================================================
