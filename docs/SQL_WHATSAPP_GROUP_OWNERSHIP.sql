-- =====================================================
-- Tabela: whatsapp_group_ownership
-- Auto-vinculação de grupos de WhatsApp a tenants
-- O primeiro tenant a processar um comando válido em um grupo torna-se "dono"
-- =====================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_group_ownership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL,
  group_name text,
  owner_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_group_ownership_group_unique UNIQUE (group_id)
);

CREATE INDEX IF NOT EXISTS idx_wgo_group_id ON public.whatsapp_group_ownership(group_id);
CREATE INDEX IF NOT EXISTS idx_wgo_owner_tenant ON public.whatsapp_group_ownership(owner_tenant_id);

CREATE TRIGGER whatsapp_group_ownership_updated_at
  BEFORE UPDATE ON public.whatsapp_group_ownership
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.whatsapp_group_ownership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON public.whatsapp_group_ownership
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admins_read"
  ON public.whatsapp_group_ownership
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "tenant_admins_read_own"
  ON public.whatsapp_group_ownership
  FOR SELECT
  USING (owner_tenant_id = get_current_tenant_id());

COMMENT ON TABLE public.whatsapp_group_ownership IS
  'Auto-vinculação de grupos WhatsApp a tenants. Primeiro tenant a processar um comando válido torna-se dono.';
