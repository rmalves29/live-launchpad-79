-- =====================================================
-- Tabela: whatsapp_allowed_groups
-- Descrição: Armazena os grupos de WhatsApp permitidos por tenant
-- para filtrar corretamente o relatório de grupos
-- =====================================================

-- Criar tabela de grupos permitidos por tenant
CREATE TABLE IF NOT EXISTS public.whatsapp_allowed_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Garantir que cada tenant não tenha nomes de grupo duplicados
  CONSTRAINT whatsapp_allowed_groups_tenant_group_unique UNIQUE (tenant_id, group_name)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_allowed_groups_tenant_id 
  ON public.whatsapp_allowed_groups(tenant_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_allowed_groups_active 
  ON public.whatsapp_allowed_groups(tenant_id, is_active) 
  WHERE is_active = true;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_allowed_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_allowed_groups_updated_at_trigger ON public.whatsapp_allowed_groups;
CREATE TRIGGER whatsapp_allowed_groups_updated_at_trigger
  BEFORE UPDATE ON public.whatsapp_allowed_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_allowed_groups_updated_at();

-- Habilitar RLS
ALTER TABLE public.whatsapp_allowed_groups ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS

-- Super admins podem ver e gerenciar todos os grupos
CREATE POLICY "super_admins_full_access" 
  ON public.whatsapp_allowed_groups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Tenant admins podem gerenciar grupos do seu próprio tenant
CREATE POLICY "tenant_admins_own_tenant"
  ON public.whatsapp_allowed_groups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = whatsapp_allowed_groups.tenant_id
      AND profiles.role IN ('tenant_admin', 'super_admin')
    )
  );

-- Usuários anônimos podem ler grupos ativos (para consultas públicas)
CREATE POLICY "anon_read_active_groups"
  ON public.whatsapp_allowed_groups
  FOR SELECT
  USING (is_active = true);

-- Comentário na tabela
COMMENT ON TABLE public.whatsapp_allowed_groups IS 
  'Grupos de WhatsApp permitidos para aparecer nos relatórios, configurados por tenant';

COMMENT ON COLUMN public.whatsapp_allowed_groups.group_name IS 
  'Nome exato do grupo de WhatsApp (como aparece no sistema)';
