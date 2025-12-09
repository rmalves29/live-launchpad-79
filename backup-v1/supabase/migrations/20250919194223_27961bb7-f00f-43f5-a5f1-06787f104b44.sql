-- Remover políticas RLS que expõem dados sensíveis dos tenants
-- PROBLEMA: A tabela 'tenants' está publicamente legível, expondo informações confidenciais

-- 1. Remover política que permite leitura pública de tenants ativos
DROP POLICY IF EXISTS "Public can read active tenants" ON public.tenants;

-- 2. Remover política que permite qualquer usuário autenticado ver todos os tenants  
DROP POLICY IF EXISTS "Authenticated users can select tenants" ON public.tenants;

-- 3. Manter apenas as políticas seguras existentes:
-- - "Super admin can select all tenants" (super admin precisa ver todos)
-- - "Users can view their own tenant" (usuários veem apenas seu próprio tenant)
-- - Políticas de update e delete já estão adequadamente restritivas

-- 4. Criar política mais específica para casos onde precise expor apenas dados básicos publicamente
-- (apenas slug e nome, sem dados sensíveis)
CREATE POLICY "Public can read basic tenant info by slug" 
ON public.tenants 
FOR SELECT 
USING (
  -- Apenas campos não sensíveis para validação de subdomínio
  true 
);

-- Na verdade, vamos remover essa política também e criar uma mais restritiva
DROP POLICY IF EXISTS "Public can read basic tenant info by slug" ON public.tenants;

-- 5. Criar função segura para validação de tenant por slug (apenas para subdomínios)
CREATE OR REPLACE FUNCTION public.get_tenant_by_slug(slug_param text)
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  is_active boolean
) 
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.id, t.name, t.slug, t.is_active
  FROM tenants t
  WHERE t.slug = slug_param 
    AND t.is_active = true
  LIMIT 1;
$$;

-- 6. Criar política para permitir que a função seja executada publicamente
-- (mas apenas retorna dados básicos, não sensíveis)
GRANT EXECUTE ON FUNCTION public.get_tenant_by_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_slug(text) TO authenticated;