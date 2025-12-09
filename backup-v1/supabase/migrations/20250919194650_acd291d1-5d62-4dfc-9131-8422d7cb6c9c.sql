-- Criar função segura para listar tenants básicos (para desenvolvimento/preview)
CREATE OR REPLACE FUNCTION public.list_active_tenants_basic()
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
  WHERE t.is_active = true
  ORDER BY t.name;
$$;

-- Permitir execução da função (apenas retorna dados básicos, não sensíveis)
GRANT EXECUTE ON FUNCTION public.list_active_tenants_basic() TO anon;
GRANT EXECUTE ON FUNCTION public.list_active_tenants_basic() TO authenticated;