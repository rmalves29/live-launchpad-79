-- ===============================================
-- MIGRAÇÃO: Integração InfinitePay (Checkout)
-- Execute este SQL no Supabase SQL Editor
-- ===============================================

-- 1. Criar tabela integration_infinitepay
CREATE TABLE IF NOT EXISTS public.integration_infinitepay (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  handle TEXT,                          -- InfiniteTag do lojista (ex: "colakids")
  environment TEXT NOT NULL DEFAULT 'production',
  pix_discount_percent NUMERIC DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_infinitepay_tenant_unique UNIQUE(tenant_id)
);

-- 2. RLS
ALTER TABLE public.integration_infinitepay ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users can view their InfinitePay integration" ON public.integration_infinitepay;
CREATE POLICY "Tenant users can view their InfinitePay integration"
  ON public.integration_infinitepay FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.tenant_id = integration_infinitepay.tenant_id OR profiles.role = 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Tenant users can manage their InfinitePay integration" ON public.integration_infinitepay;
CREATE POLICY "Tenant users can manage their InfinitePay integration"
  ON public.integration_infinitepay FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.tenant_id = integration_infinitepay.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- 3. Trigger updated_at
DROP TRIGGER IF EXISTS tr_infinitepay_updated_at ON public.integration_infinitepay;
CREATE TRIGGER tr_infinitepay_updated_at
  BEFORE UPDATE ON public.integration_infinitepay
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integration_updated_at();

-- 4. Atualizar exclusividade mútua para incluir InfinitePay
CREATE OR REPLACE FUNCTION public.deactivate_other_payment_integrations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    IF TG_TABLE_NAME <> 'integration_mp' THEN
      UPDATE public.integration_mp SET is_active = FALSE, updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND is_active = TRUE;
    END IF;
    IF TG_TABLE_NAME <> 'integration_pagarme' THEN
      UPDATE public.integration_pagarme SET is_active = FALSE, updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND is_active = TRUE;
    END IF;
    IF TG_TABLE_NAME <> 'integration_appmax' THEN
      UPDATE public.integration_appmax SET is_active = FALSE, updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND is_active = TRUE;
    END IF;
    IF TG_TABLE_NAME <> 'integration_infinitepay' THEN
      UPDATE public.integration_infinitepay SET is_active = FALSE, updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND is_active = TRUE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Trigger no InfinitePay
DROP TRIGGER IF EXISTS tr_infinitepay_deactivate_others ON public.integration_infinitepay;
CREATE TRIGGER tr_infinitepay_deactivate_others
  BEFORE INSERT OR UPDATE OF is_active ON public.integration_infinitepay
  FOR EACH ROW
  WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION public.deactivate_other_payment_integrations();

-- 6. Garantir triggers nas outras tabelas (idempotente)
DROP TRIGGER IF EXISTS tr_mp_deactivate_others ON public.integration_mp;
CREATE TRIGGER tr_mp_deactivate_others
  BEFORE INSERT OR UPDATE OF is_active ON public.integration_mp
  FOR EACH ROW WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION public.deactivate_other_payment_integrations();

DROP TRIGGER IF EXISTS tr_pagarme_deactivate_others ON public.integration_pagarme;
CREATE TRIGGER tr_pagarme_deactivate_others
  BEFORE INSERT OR UPDATE OF is_active ON public.integration_pagarme
  FOR EACH ROW WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION public.deactivate_other_payment_integrations();

DROP TRIGGER IF EXISTS tr_appmax_deactivate_others ON public.integration_appmax;
CREATE TRIGGER tr_appmax_deactivate_others
  BEFORE INSERT OR UPDATE OF is_active ON public.integration_appmax
  FOR EACH ROW WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION public.deactivate_other_payment_integrations();

COMMENT ON TABLE public.integration_infinitepay IS 'Integração de checkout InfinitePay por tenant. Apenas uma integração de pagamento pode estar ativa por vez (exclusividade mútua via trigger).';
