
-- 1) Tabela de credenciais da API Oficial Meta por tenant
CREATE TABLE public.integration_whatsapp_official (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  waba_id text NOT NULL,
  access_token text NOT NULL,
  app_id text,
  webhook_verify_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  display_phone_number text,
  verified_name text,
  business_account_status text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_whatsapp_official TO authenticated;
GRANT ALL ON public.integration_whatsapp_official TO service_role;

ALTER TABLE public.integration_whatsapp_official ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins manage their official whatsapp"
  ON public.integration_whatsapp_official
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_own_tenant_id()
    OR public.is_super_admin()
  )
  WITH CHECK (
    tenant_id = public.get_own_tenant_id()
    OR public.is_super_admin()
  );

CREATE TRIGGER set_integration_whatsapp_official_updated_at
  BEFORE UPDATE ON public.integration_whatsapp_official
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Coluna whatsapp_provider em tenants (canal para envios 1:1)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS whatsapp_provider text NOT NULL DEFAULT 'zapi'
  CHECK (whatsapp_provider IN ('zapi', 'official'));

-- 3) Colunas para templates oficiais
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS official_template_name text,
  ADD COLUMN IF NOT EXISTS official_status text NOT NULL DEFAULT 'not_submitted'
    CHECK (official_status IN ('not_submitted','pending','approved','rejected','disabled')),
  ADD COLUMN IF NOT EXISTS official_category text NOT NULL DEFAULT 'UTILITY'
    CHECK (official_category IN ('UTILITY','MARKETING','AUTHENTICATION')),
  ADD COLUMN IF NOT EXISTS official_language text NOT NULL DEFAULT 'pt_BR',
  ADD COLUMN IF NOT EXISTS official_rejection_reason text,
  ADD COLUMN IF NOT EXISTS official_components jsonb,
  ADD COLUMN IF NOT EXISTS official_variables jsonb,
  ADD COLUMN IF NOT EXISTS official_last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_official_status
  ON public.whatsapp_templates(tenant_id, official_status);
