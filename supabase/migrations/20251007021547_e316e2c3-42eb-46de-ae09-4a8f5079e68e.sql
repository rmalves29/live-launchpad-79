-- Dropar e recriar funções que retornam dados do tenant para incluir novos campos

-- Drop das funções existentes
DROP FUNCTION IF EXISTS public.get_tenant_by_slug(text);
DROP FUNCTION IF EXISTS public.get_tenant_by_id(uuid);
DROP FUNCTION IF EXISTS public.list_active_tenants_basic();

-- Recriar função get_tenant_by_slug
CREATE FUNCTION public.get_tenant_by_slug(slug_param text)
 RETURNS TABLE(id uuid, name text, slug text, is_active boolean, enable_live boolean, enable_sendflow boolean, max_whatsapp_groups integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.slug, t.is_active, t.enable_live, t.enable_sendflow, t.max_whatsapp_groups
  FROM tenants t
  WHERE t.slug = slug_param 
    AND t.is_active = true
  LIMIT 1;
$function$;

-- Recriar função get_tenant_by_id
CREATE FUNCTION public.get_tenant_by_id(tenant_id_param uuid)
 RETURNS TABLE(id uuid, name text, slug text, is_active boolean, enable_live boolean, enable_sendflow boolean, max_whatsapp_groups integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.slug, t.is_active, t.enable_live, t.enable_sendflow, t.max_whatsapp_groups
  FROM tenants t
  WHERE t.id = tenant_id_param 
    AND t.is_active = true
  LIMIT 1;
$function$;

-- Recriar função list_active_tenants_basic
CREATE FUNCTION public.list_active_tenants_basic()
 RETURNS TABLE(id uuid, name text, slug text, is_active boolean, enable_live boolean, enable_sendflow boolean, max_whatsapp_groups integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.slug, t.is_active, t.enable_live, t.enable_sendflow, t.max_whatsapp_groups
  FROM tenants t
  WHERE t.is_active = true
  ORDER BY t.name;
$function$;