
-- ==========================================================================
-- fe_return_automations: configuração das automações de retorno por tenant
-- ==========================================================================
CREATE TABLE public.fe_return_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_ids UUID[] NOT NULL DEFAULT '{}',
  delay_minutes INTEGER NOT NULL DEFAULT 60,
  invite_message TEXT NOT NULL,
  reward_message TEXT NOT NULL,
  coupon_code TEXT NOT NULL,
  validity_days INTEGER NOT NULL DEFAULT 7,
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fe_return_automations_tenant_active ON public.fe_return_automations(tenant_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fe_return_automations TO authenticated;
GRANT ALL ON public.fe_return_automations TO service_role;

ALTER TABLE public.fe_return_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "return_automations_tenant_all" ON public.fe_return_automations
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());

CREATE TRIGGER trg_fe_return_automations_updated_at
  BEFORE UPDATE ON public.fe_return_automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================================================
-- fe_return_pending: fila de convites e recompensas pendentes
-- ==========================================================================
CREATE TABLE public.fe_return_pending (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.fe_return_automations(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.fe_groups(id) ON DELETE SET NULL,
  group_jid TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  invite_send_at TIMESTAMPTZ NOT NULL,
  invite_sent_at TIMESTAMPTZ,
  reward_sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fe_return_pending_status_chk CHECK (status IN ('scheduled','invited','rewarded','expired','cancelled','failed'))
);

CREATE INDEX idx_fe_return_pending_dispatch ON public.fe_return_pending(status, invite_send_at) WHERE status = 'scheduled';
CREATE INDEX idx_fe_return_pending_lookup ON public.fe_return_pending(tenant_id, group_jid, phone, status);
CREATE INDEX idx_fe_return_pending_expiry ON public.fe_return_pending(status, expires_at) WHERE status IN ('scheduled','invited');

GRANT SELECT ON public.fe_return_pending TO authenticated;
GRANT ALL ON public.fe_return_pending TO service_role;

ALTER TABLE public.fe_return_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "return_pending_tenant_read" ON public.fe_return_pending
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());

CREATE TRIGGER trg_fe_return_pending_updated_at
  BEFORE UPDATE ON public.fe_return_pending
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
