CREATE TABLE public.subscription_recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id text NOT NULL,
  interval_months integer NOT NULL CHECK (interval_months IN (6, 12)),
  price numeric(10,2) NOT NULL,
  pagarme_subscription_id text UNIQUE,
  pagarme_customer_id text,
  pagarme_card_id text,
  pagarme_code text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  current_period_end timestamptz,
  last_charge_at timestamptz,
  last_charge_status text,
  last_charge_id text,
  cancel_at timestamptz,
  canceled_at timestamptz,
  card_brand text,
  card_last4 text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plan_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_subscription_recurrences_tenant ON public.subscription_recurrences(tenant_id);
CREATE INDEX idx_subscription_recurrences_pagarme_sub ON public.subscription_recurrences(pagarme_subscription_id);
CREATE INDEX idx_subscription_recurrences_status ON public.subscription_recurrences(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_recurrences TO authenticated;
GRANT ALL ON public.subscription_recurrences TO service_role;

ALTER TABLE public.subscription_recurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view own subscription recurrences"
  ON public.subscription_recurrences FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());

CREATE POLICY "Tenant admin can update own subscription recurrences"
  ON public.subscription_recurrences FOR UPDATE
  TO authenticated
  USING ((tenant_id = public.get_user_tenant_id() AND public.is_tenant_admin()) OR public.is_super_admin());

CREATE POLICY "Super admin manages all"
  ON public.subscription_recurrences FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE TRIGGER set_subscription_recurrences_updated_at
  BEFORE UPDATE ON public.subscription_recurrences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();