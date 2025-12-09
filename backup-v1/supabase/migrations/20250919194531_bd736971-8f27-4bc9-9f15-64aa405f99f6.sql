-- Criar função segura para buscar tenant por ID (para modo preview/desenvolvimento)
CREATE OR REPLACE FUNCTION public.get_tenant_by_id(tenant_id_param uuid)
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
  WHERE t.id = tenant_id_param 
    AND t.is_active = true
  LIMIT 1;
$$;

-- Permitir execução pública da função (apenas retorna dados básicos)
GRANT EXECUTE ON FUNCTION public.get_tenant_by_id(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_id(uuid) TO authenticated;