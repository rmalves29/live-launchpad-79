-- App Max removida do sistema (19/11/2026). Nenhuma loja usava: 1 cadastro inativo desde fev/2026.
-- Reversível: a tabela não é apagada, vai para o esquema "arquivo" (fora da API) com o nome integration_appmax_removida.
-- Para voltar: alter table arquivo.integration_appmax_removida set schema public; + renomear para integration_appmax.

-- 1) "Só um gateway ativo por loja" deixa de mexer na App Max (senão ativar outro gateway daria erro sem a tabela).
create or replace function public.deactivate_other_payment_integrations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.is_active = true then
    if tg_table_name <> 'integration_mp' then
      update public.integration_mp set is_active = false, updated_at = now()
       where tenant_id = new.tenant_id and is_active = true;
    end if;
    if tg_table_name <> 'integration_pagarme' then
      update public.integration_pagarme set is_active = false, updated_at = now()
       where tenant_id = new.tenant_id and is_active = true;
    end if;
    if tg_table_name <> 'integration_infinitepay' then
      update public.integration_infinitepay set is_active = false, updated_at = now()
       where tenant_id = new.tenant_id and is_active = true;
    end if;
    if tg_table_name <> 'integration_sipag' then
      update public.integration_sipag set is_active = false, updated_at = now()
       where tenant_id = new.tenant_id and is_active = true;
    end if;
  end if;
  return new;
end;
$function$;

-- 2) Arquiva a tabela (idempotente: roda de novo sem erro).
create schema if not exists arquivo;
revoke all on schema arquivo from public, anon, authenticated;

do $$
begin
  if to_regclass('public.integration_appmax') is not null then
    drop trigger if exists tr_appmax_deactivate_others on public.integration_appmax;
    drop trigger if exists ensure_payment_method_enabled_appmax on public.integration_appmax;
    alter table public.integration_appmax set schema arquivo;
    alter table arquivo.integration_appmax rename to integration_appmax_removida;
    revoke all on arquivo.integration_appmax_removida from public, anon, authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
