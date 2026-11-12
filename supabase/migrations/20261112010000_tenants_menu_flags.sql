-- Itens do menu ligados/desligados por empresa (Configurações > Empresas > Editar > Menus da empresa).
-- Chave ausente = padrão do sistema (ligado, exceto "live_tiktok", que nasce desligado).
-- Live (Instagram), Loja da Live e SendFlow continuam nas colunas enable_live / enable_loja_live / enable_sendflow.
alter table public.tenants add column if not exists menu_flags jsonb not null default '{}'::jsonb;

-- "Lançar pedidos TikTok" só para a FL Semi Joias (fernandalimasemijoia); as demais ficam desligadas.
update public.tenants
   set menu_flags = coalesce(menu_flags, '{}'::jsonb) || '{"live_tiktok": false}'::jsonb
 where slug <> 'fernandalimasemijoia';
update public.tenants
   set menu_flags = coalesce(menu_flags, '{}'::jsonb) || '{"live_tiktok": true}'::jsonb
 where slug = 'fernandalimasemijoia';

-- O menu lê a empresa por estas funções (colunas fixas): passam a devolver menu_flags.
drop function if exists public.get_tenant_by_id(uuid);
create function public.get_tenant_by_id(tenant_id_param uuid)
 returns table(id uuid, name text, slug text, is_active boolean, enable_live boolean, enable_sendflow boolean, max_whatsapp_groups integer, subscription_ends_at timestamp with time zone, enable_loja_live boolean, menu_flags jsonb)
 language sql stable security definer set search_path to 'public'
as $function$
  select t.id, t.name, t.slug, t.is_active, t.enable_live, t.enable_sendflow, t.max_whatsapp_groups, t.subscription_ends_at, t.enable_loja_live, t.menu_flags
  from tenants t
  where t.id = tenant_id_param
    and t.is_active = true
  limit 1;
$function$;

drop function if exists public.list_active_tenants_basic();
create function public.list_active_tenants_basic()
 returns table(id uuid, name text, slug text, is_active boolean, enable_live boolean, enable_sendflow boolean, max_whatsapp_groups integer, enable_loja_live boolean, menu_flags jsonb)
 language sql stable security definer set search_path to 'public'
as $function$
  select t.id, t.name, t.slug, t.is_active, t.enable_live, t.enable_sendflow, t.max_whatsapp_groups, t.enable_loja_live, t.menu_flags
  from tenants t
  where t.is_active = true
  order by t.name;
$function$;

grant execute on function public.get_tenant_by_id(uuid) to anon, authenticated, service_role;
grant execute on function public.list_active_tenants_basic() to anon, authenticated, service_role;
