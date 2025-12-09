-- Migration: Adiciona controle de expiração para tenants
-- Permite definir prazo de acesso para cada empresa

-- Adicionar campos de controle
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 30;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'trial';

-- Comentários
COMMENT ON COLUMN tenants.expires_at IS 'Data de expiração do acesso da tenant';
COMMENT ON COLUMN tenants.trial_days IS 'Dias de trial period';
COMMENT ON COLUMN tenants.plan IS 'Plano contratado: trial, basic, premium, enterprise';

-- Função para verificar se tenant está expirada
CREATE OR REPLACE FUNCTION is_tenant_expired(tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  expiration_date TIMESTAMPTZ;
BEGIN
  SELECT expires_at INTO expiration_date
  FROM tenants
  WHERE id = tenant_id;
  
  IF expiration_date IS NULL THEN
    RETURN false; -- Sem data de expiração = acesso ilimitado
  END IF;
  
  RETURN expiration_date < NOW();
END;
$$ LANGUAGE plpgsql;

-- Função para estender prazo de tenant
CREATE OR REPLACE FUNCTION extend_tenant_access(
  tenant_id UUID,
  days INTEGER
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  new_expiration TIMESTAMPTZ;
BEGIN
  -- Se não tem data de expiração, usa data atual
  SELECT COALESCE(expires_at, NOW()) + (days || ' days')::INTERVAL
  INTO new_expiration
  FROM tenants
  WHERE id = tenant_id;
  
  -- Atualiza a data de expiração
  UPDATE tenants
  SET expires_at = new_expiration,
      updated_at = NOW()
  WHERE id = tenant_id;
  
  RETURN new_expiration;
END;
$$ LANGUAGE plpgsql;

-- Trigger para definir expiração automática ao criar tenant (trial de 30 dias)
CREATE OR REPLACE FUNCTION set_trial_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL AND NEW.plan = 'trial' THEN
    NEW.expires_at := NOW() + (NEW.trial_days || ' days')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_trial_expiration
  BEFORE INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION set_trial_expiration();

-- View para listar tenants com status de expiração
CREATE OR REPLACE VIEW tenants_with_status AS
SELECT 
  t.*,
  CASE 
    WHEN t.expires_at IS NULL THEN 'unlimited'
    WHEN t.expires_at < NOW() THEN 'expired'
    WHEN t.expires_at < NOW() + INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'active'
  END AS status,
  CASE 
    WHEN t.expires_at IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM (t.expires_at - NOW()))::INTEGER
  END AS days_remaining
FROM tenants t;

-- Exemplo de uso:
-- SELECT * FROM tenants_with_status WHERE status = 'active';
-- SELECT extend_tenant_access('tenant-uuid', 30); -- Estende por 30 dias
