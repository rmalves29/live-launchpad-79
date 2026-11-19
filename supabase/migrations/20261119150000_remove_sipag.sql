-- Sipag removida do sistema (19/11/2026, decisão do Rafael). Nunca cobrou: o checkout não chamava a create-sipag-payment
-- e nenhuma loja chegou a cadastrar. Reversível: a tabela vai para o esquema "arquivo" (fora da API).

-- 1) "Só um gateway ativo por loja" passa a cuidar só de Mercado Pago, Pagar.me e InfinitePay.
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
  end if;
  return new;
end;
$function$;

-- 2) Arquiva a tabela (idempotente).
create schema if not exists arquivo;
revoke all on schema arquivo from public, anon, authenticated;

do $$
begin
  if to_regclass('public.integration_sipag') is not null then
    drop trigger if exists tr_sipag_deactivate_others on public.integration_sipag;
    alter table public.integration_sipag set schema arquivo;
    alter table arquivo.integration_sipag rename to integration_sipag_removida;
    revoke all on arquivo.integration_sipag_removida from public, anon, authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
