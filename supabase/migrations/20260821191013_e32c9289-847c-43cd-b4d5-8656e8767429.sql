DROP FUNCTION IF EXISTS public.get_tenant_by_id(uuid);

CREATE FUNCTION public.get_tenant_by_id(tenant_id_param uuid)
 RETURNS TABLE(id uuid, name text, slug text, is_active boolean, enable_live boolean, enable_sendflow boolean, max_whatsapp_groups integer, subscription_ends_at timestamptz)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.slug, t.is_active, t.enable_live, t.enable_sendflow, t.max_whatsapp_groups, t.subscription_ends_at
  FROM tenants t
  WHERE t.id = tenant_id_param 
    AND t.is_active = true
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tenant_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_id(uuid) TO service_role;