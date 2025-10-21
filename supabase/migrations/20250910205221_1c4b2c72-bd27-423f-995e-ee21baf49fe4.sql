-- Criar tabela simples para credenciais de tenant
CREATE TABLE IF NOT EXISTS public.tenant_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id) -- Só uma credencial por tenant
);

-- Enable RLS
ALTER TABLE public.tenant_credentials ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admin can manage all tenant credentials" 
ON public.tenant_credentials 
FOR ALL 
TO authenticated 
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Tenant users can view their credentials" 
ON public.tenant_credentials 
FOR SELECT 
TO authenticated 
USING (tenant_id = get_current_tenant_id());

-- Trigger para updated_at
CREATE TRIGGER update_tenant_credentials_updated_at
BEFORE UPDATE ON public.tenant_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrar dados existentes dos tenants que tem admin_email
INSERT INTO public.tenant_credentials (tenant_id, email, password_hash, is_active)
SELECT id, admin_email, 'NEEDS_RESET', true
FROM public.tenants 
WHERE admin_email IS NOT NULL 
  AND admin_email != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_credentials tc WHERE tc.tenant_id = tenants.id
  );