-- Flag própria da Loja da Live por empresa (antes ela dependia da flag da Live).
-- Ligada por padrão: ninguém perde acesso até o super admin desligar na tela Empresas.
alter table public.tenants add column if not exists enable_loja_live boolean not null default true;

-- O menu lê a empresa por estas funções (colunas fixas): incluem a flag nova.
drop function if exists public.get_tenant_by_id(uuid);
create function public.get_tenant_by_id(tenant_id_param uuid)
 returns table(id uuid, name text, slug text, is_active boolean, enable_live boolean, enable_sendflow boolean, max_whatsapp_groups integer, subscription_ends_at timestamp with time zone, enable_loja_live boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select t.id, t.name, t.slug, t.is_active, t.enable_live, t.enable_sendflow, t.max_whatsapp_groups, t.subscription_ends_at, t.enable_loja_live
  from tenants t
  where t.id = tenant_id_param
    and t.is_active = true
  limit 1;
$function$;

drop function if exists public.list_active_tenants_basic();
create function public.list_active_tenants_basic()
 returns table(id uuid, name text, slug text, is_active boolean, enable_live boolean, enable_sendflow boolean, max_whatsapp_groups integer, enable_loja_live boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select t.id, t.name, t.slug, t.is_active, t.enable_live, t.enable_sendflow, t.max_whatsapp_groups, t.enable_loja_live
  from tenants t
  where t.is_active = true
  order by t.name;
$function$;
