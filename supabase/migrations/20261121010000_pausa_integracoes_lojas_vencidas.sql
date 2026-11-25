-- Pausa automática das integrações de lojas com assinatura vencida (20/11/2026)
--
-- Regra:
--   * PAUSA (rotina diária, 03h15 de Brasília): loja com assinatura vencida há mais de 10 dias
--     E sem nenhum pedido nos últimos 10 dias. As integrações ativas dela são desligadas
--     (is_active = false) e cada uma fica registrada em integration_auto_pauses.
--   * RETOMADA (na hora): quando a assinatura da loja volta a valer (data de vencimento no futuro,
--     loja ativa e não bloqueada), o gatilho em tenants religa exatamente as integrações que a
--     pausa desligou. O que a própria loja tinha desligado antes continua desligado.
--
-- Integrações cobertas: Bling, Olist, Bagy, Omie, Instagram, WhatsApp e frete.
-- Gateways de pagamento ficam de fora de propósito: parados não geram chamada nenhuma, e desligar
-- poderia impedir a confirmação de um Pix pago com atraso.
--
-- Para desfazer: select cron.unschedule('pausa-integracoes-lojas-vencidas');
--                drop trigger trg_tenants_retoma_integracoes on public.tenants;
--                select public.integracoes_retomar_loja(tenant_id, true) from (select distinct tenant_id
--                  from public.integration_auto_pauses where resumed_at is null) x;

create table if not exists public.integration_auto_pauses (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tabela text not null,
  linha_id uuid not null,
  motivo text not null,
  paused_at timestamptz not null default now(),
  resumed_at timestamptz,
  resultado text
);
create index if not exists integration_auto_pauses_abertas
  on public.integration_auto_pauses (tenant_id) where resumed_at is null;

alter table public.integration_auto_pauses enable row level security;
drop policy if exists "super admin vê pausas automáticas" on public.integration_auto_pauses;
create policy "super admin vê pausas automáticas" on public.integration_auto_pauses
  for select to authenticated using (public.is_super_admin());

-- Tabelas que a regra pode desligar (precisam ter id uuid, tenant_id e is_active).
create or replace function private.integracoes_pausaveis()
returns text[] language sql immutable as $$
  select array['integration_bling','integration_olist','integration_bagy','integration_omie',
               'integration_instagram','integration_whatsapp','shipping_integrations']
$$;

-- Loja está "em dia"? (assinatura sem data = loja interna/sem cobrança = sempre em dia)
create or replace function private.loja_em_dia(t public.tenants)
returns boolean language sql stable as $$
  select coalesce(t.is_active, true)
     and not coalesce(t.is_blocked, false)
     and (t.subscription_ends_at is null or t.subscription_ends_at > now())
$$;

create or replace function public.integracoes_pausar_lojas_vencidas(p_dias int default 10, p_simular boolean default false)
returns table (loja text, tabela text, integracoes int)
language plpgsql security definer set search_path = public, private
as $$
declare
  t record; tab text; n int;
begin
  for t in
    select tn.id, tn.name, tn.subscription_ends_at
      from public.tenants tn
     where tn.subscription_ends_at is not null
       and tn.subscription_ends_at < now() - make_interval(days => p_dias)
       and not exists (select 1 from public.orders o
                        where o.tenant_id = tn.id and o.created_at > now() - make_interval(days => p_dias))
  loop
    foreach tab in array private.integracoes_pausaveis() loop
      if to_regclass('public.' || tab) is null then continue; end if;
      if p_simular then
        execute format('select count(*) from public.%I where tenant_id = $1 and is_active', tab) into n using t.id;
      else
        execute format($q$
          with desligadas as (
            update public.%I set is_active = false
             where tenant_id = $1 and is_active
            returning id)
          insert into public.integration_auto_pauses (tenant_id, tabela, linha_id, motivo)
          select $1, %L, id, $2 from desligadas
        $q$, tab, tab)
        using t.id, 'assinatura vencida em ' || to_char(t.subscription_ends_at, 'DD/MM/YYYY') || ' e sem pedidos há ' || p_dias || ' dias';
        get diagnostics n = row_count;
      end if;
      if n > 0 then
        loja := t.name; tabela := tab; integracoes := n; return next;
      end if;
    end loop;
  end loop;
end;
$$;

-- Religa só o que a pausa automática desligou. p_forcar = religar mesmo com a loja vencida (para desfazer).
create or replace function public.integracoes_retomar_loja(p_tenant_id uuid, p_forcar boolean default false)
returns int
language plpgsql security definer set search_path = public, private
as $$
declare
  p record; religadas int := 0; tn public.tenants;
begin
  select * into tn from public.tenants where id = p_tenant_id;
  if not found then return 0; end if;
  if not p_forcar and not private.loja_em_dia(tn) then return 0; end if;

  for p in select * from public.integration_auto_pauses
            where tenant_id = p_tenant_id and resumed_at is null order by id
  loop
    begin
      execute format('update public.%I set is_active = true where id = $1', p.tabela) using p.linha_id;
      update public.integration_auto_pauses set resumed_at = now(), resultado = 'religada' where id = p.id;
      religadas := religadas + 1;
    exception when others then
      -- ex.: limite de transportadoras ativas atingido porque a loja ligou outra no meio tempo
      update public.integration_auto_pauses set resumed_at = now(), resultado = 'não religada: ' || sqlerrm where id = p.id;
    end;
  end loop;
  return religadas;
end;
$$;

revoke all on function public.integracoes_pausar_lojas_vencidas(int, boolean) from public, anon, authenticated;
revoke all on function public.integracoes_retomar_loja(uuid, boolean) from public, anon, authenticated;
grant execute on function public.integracoes_pausar_lojas_vencidas(int, boolean) to service_role;
grant execute on function public.integracoes_retomar_loja(uuid, boolean) to service_role;

-- Retomada imediata quando a loja renova / é reativada / desbloqueada.
create or replace function private.tenants_retoma_integracoes()
returns trigger language plpgsql security definer set search_path = public, private
as $$
begin
  if private.loja_em_dia(new)
     and exists (select 1 from public.integration_auto_pauses where tenant_id = new.id and resumed_at is null) then
    perform public.integracoes_retomar_loja(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tenants_retoma_integracoes on public.tenants;
create trigger trg_tenants_retoma_integracoes
  after update of subscription_ends_at, is_active, is_blocked on public.tenants
  for each row execute function private.tenants_retoma_integracoes();

-- Rotina diária às 06:15 UTC (03:15 em Brasília), fora de qualquer live.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('pausa-integracoes-lojas-vencidas')
      where exists (select 1 from cron.job where jobname = 'pausa-integracoes-lojas-vencidas');
    perform cron.schedule('pausa-integracoes-lojas-vencidas', '15 6 * * *',
      'select public.integracoes_pausar_lojas_vencidas(10)');
  end if;
end $$;
