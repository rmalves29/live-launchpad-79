-- ============================================================
-- REFAZER REGRA DE CONSENTIMENTO WHATSAPP - ESTADO GLOBAL
-- ============================================================
-- Execute este SQL no Supabase SQL Editor uma única vez.
-- Substitui a lógica antiga (toggle por tenant + customers.consentimento_ativo)
-- por uma máquina de estados única, válida para todos os tenants.
-- ============================================================

-- 1. Tabela de estado da máquina de consentimento
CREATE TABLE IF NOT EXISTS public.whatsapp_consent_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_phone text NOT NULL,                    -- normalizado (preferencialmente com 55 + DDD + número)
  status text NOT NULL CHECK (status IN ('awaiting','active','silenced','declined')),
  request_sent_at timestamptz,
  request_expires_at timestamptz,                  -- request_sent_at + 1h
  consent_granted_at timestamptz,
  consent_expires_at timestamptz,                  -- consent_granted_at + 3 dias
  last_message_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_consent_state_unique UNIQUE (tenant_id, customer_phone)
);

CREATE INDEX IF NOT EXISTS idx_wcs_tenant_phone
  ON public.whatsapp_consent_state(tenant_id, customer_phone);

CREATE INDEX IF NOT EXISTS idx_wcs_status
  ON public.whatsapp_consent_state(tenant_id, status);

-- 2. Trigger para manter updated_at
CREATE OR REPLACE FUNCTION public.touch_whatsapp_consent_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_whatsapp_consent_state ON public.whatsapp_consent_state;
CREATE TRIGGER trg_touch_whatsapp_consent_state
BEFORE UPDATE ON public.whatsapp_consent_state
FOR EACH ROW
EXECUTE FUNCTION public.touch_whatsapp_consent_state();

-- 3. RLS
ALTER TABLE public.whatsapp_consent_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users can view their consent state" ON public.whatsapp_consent_state;
CREATE POLICY "Tenant users can view their consent state"
ON public.whatsapp_consent_state
FOR SELECT
USING (tenant_id = get_current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Service role manages consent state" ON public.whatsapp_consent_state;
CREATE POLICY "Service role manages consent state"
ON public.whatsapp_consent_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Backfill: copiar quem hoje tem consentimento ativo em customers
INSERT INTO public.whatsapp_consent_state
  (tenant_id, customer_phone, status, consent_granted_at, consent_expires_at)
SELECT
  c.tenant_id,
  c.phone,
  'active',
  c.data_permissao,
  c.data_permissao + interval '3 days'
FROM public.customers c
WHERE c.consentimento_ativo = true
  AND c.data_permissao IS NOT NULL
  AND c.phone IS NOT NULL
ON CONFLICT (tenant_id, customer_phone) DO NOTHING;

-- Confirmação
SELECT 'whatsapp_consent_state criada e populada' AS status,
       (SELECT COUNT(*) FROM public.whatsapp_consent_state) AS total_rows;
