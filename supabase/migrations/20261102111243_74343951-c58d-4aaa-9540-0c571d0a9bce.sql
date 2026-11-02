CREATE TABLE public.tenant_onboarding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','cancelado','erro','expirado','processando')),
  company_name text NOT NULL,
  slug text NOT NULL,
  company_email text,
  admin_email text NOT NULL,
  contact_name text,
  contact_phone text,
  sells_live boolean NOT NULL DEFAULT false,
  sells_bazar boolean NOT NULL DEFAULT false,
  cnpj text,
  address text,
  notes text,
  logo_url text,
  access_type text NOT NULL DEFAULT 'tenant_admin',
  plan text NOT NULL DEFAULT 'basic',
  trial_days integer NOT NULL DEFAULT 33,
  whatsapp_provider text NOT NULL DEFAULT 'uazapi',
  password_suffix text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  approved_at timestamptz,
  tenant_id uuid,
  error_message text,
  welcome_sent_at timestamptz,
  approval_sent_at timestamptz
);
CREATE UNIQUE INDEX tenant_onboarding_pending_code_uq ON public.tenant_onboarding_requests (short_code) WHERE status IN ('pendente','processando');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_onboarding_requests TO authenticated;
GRANT ALL ON public.tenant_onboarding_requests TO service_role;
ALTER TABLE public.tenant_onboarding_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin manages onboarding requests" ON public.tenant_onboarding_requests
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER tenant_onboarding_requests_updated_at BEFORE UPDATE ON public.tenant_onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS onboarding_approver_phone text;