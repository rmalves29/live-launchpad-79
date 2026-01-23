-- ===============================================
-- MIGRAÇÃO: Integração Pagar.me com Exclusividade Mútua
-- Execute este SQL no Supabase SQL Editor
-- ===============================================

-- 1. Criar tabela integration_pagarme
CREATE TABLE IF NOT EXISTS public.integration_pagarme (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  api_key TEXT,
  public_key TEXT,
  encryption_key TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  webhook_secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Garantir apenas uma integração por tenant
  CONSTRAINT integration_pagarme_tenant_unique UNIQUE(tenant_id)
);

-- 2. Habilitar RLS
ALTER TABLE public.integration_pagarme ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS
CREATE POLICY "Tenant users can view their Pagarme integration"
  ON public.integration_pagarme
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.tenant_id = integration_pagarme.tenant_id OR profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Tenant users can manage their Pagarme integration"
  ON public.integration_pagarme
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.tenant_id = integration_pagarme.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- 4. Função para exclusividade mútua entre integrações de pagamento
CREATE OR REPLACE FUNCTION deactivate_other_payment_integrations()
RETURNS TRIGGER AS $$
BEGIN
  -- Só executa se is_active está sendo definido como true
  IF NEW.is_active = TRUE THEN
    -- Se for trigger do Pagar.me, desativar Mercado Pago
    IF TG_TABLE_NAME = 'integration_pagarme' THEN
      UPDATE public.integration_mp
      SET is_active = FALSE, updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND is_active = TRUE;
    -- Se for trigger do Mercado Pago, desativar Pagar.me
    ELSIF TG_TABLE_NAME = 'integration_mp' THEN
      UPDATE public.integration_pagarme
      SET is_active = FALSE, updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND is_active = TRUE;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger para integration_pagarme
DROP TRIGGER IF EXISTS tr_pagarme_deactivate_others ON public.integration_pagarme;
CREATE TRIGGER tr_pagarme_deactivate_others
  BEFORE INSERT OR UPDATE OF is_active ON public.integration_pagarme
  FOR EACH ROW
  WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION deactivate_other_payment_integrations();

-- 6. Trigger para integration_mp (exclusividade mútua)
DROP TRIGGER IF EXISTS tr_mp_deactivate_others ON public.integration_mp;
CREATE TRIGGER tr_mp_deactivate_others
  BEFORE INSERT OR UPDATE OF is_active ON public.integration_mp
  FOR EACH ROW
  WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION deactivate_other_payment_integrations();

-- 7. Comentário para documentação
COMMENT ON TABLE public.integration_pagarme IS 'Integração de pagamento via Pagar.me por tenant. Apenas uma integração de pagamento pode estar ativa por vez.';
