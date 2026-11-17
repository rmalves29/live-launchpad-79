-- Link recorrente da Pagar.me (compartilhado) passa a CREDITAR DIAS na empresa que pagou.
-- Antes: o pagamento só atribuía comissão de afiliado e ativava cadastro novo; empresa já existente nunca ganhava dias.
-- Regra (Rafael, 16/11/2026): cada cobrança paga credita 31 dias (antes eram 33 no início e "1 mês" na renovação).
-- A data nova soma em cima do que sobrou: parte do maior entre o vencimento atual e a data do pagamento.
-- Idempotente por cobrança (payment_ref): o mesmo pagamento nunca credita duas vezes, venha ele do webhook,
-- do vínculo manual ou da conferência diária com a Pagar.me.

create table if not exists public.platform_pagarme_credits (
  payment_ref text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_key text,
  days integer not null,
  ends_before timestamptz,
  ends_after timestamptz,
  source text,
  credited_at timestamptz not null default now()
);
alter table public.platform_pagarme_credits enable row level security;
drop policy if exists "creditos pagarme leitura super admin" on public.platform_pagarme_credits;
create policy "creditos pagarme leitura super admin" on public.platform_pagarme_credits
  for select to authenticated using (public.is_super_admin());

alter table public.platform_unmatched_payments add column if not exists plan_key text;

-- Novas empresas: 31 dias iniciais (era 33)
alter table public.tenant_onboarding_requests alter column trial_days set default 31;

-- Cadastro self-service pago: primeiro período = 31 dias (era 1 mês)
create or replace function public.platform_signup_activate(_tenant_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare t tenants%rowtype;
begin
  if not (auth.role() = 'service_role' or public.is_super_admin()) then raise exception 'forbidden'; end if;
  select * into t from tenants where id = _tenant_id for update;
  if t.id is null or coalesce(t.signup_status,'') not in ('aguardando_pagamento','expirado') then return false; end if;
  update tenants set signup_status = 'pago', signup_paid_at = now(), is_active = true, is_blocked = false,
    plan_type = coalesce(t.signup_plan, 'live'),
    subscription_ends_at = now() + interval '31 days',
    enable_live = coalesce(t.signup_plan,'live') in ('live','completo'),
    enable_loja_live = coalesce(t.signup_plan,'live') in ('live','completo'),
    enable_sendflow = coalesce(t.signup_plan,'live') in ('grupos_vip','completo')
  where id = _tenant_id;
  update platform_affiliate_leads set status = 'fechado', status_updated_at = now()
   where tenant_id = _tenant_id and status in ('aguardando_pagamento','expirado','indicado','reuniao_feita');
  return true;
end $$;

-- Credita os dias de UMA cobrança paga.
create or replace function public.platform_pagarme_credit(
  _tenant_id uuid, _payment_ref text, _paid_at timestamptz, _plan_key text default null,
  _days integer default 31, _source text default 'pagamento')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare t tenants%rowtype; paid timestamptz := coalesce(_paid_at, now()); nova timestamptz; ins integer;
  modulo boolean := _plan_key in ('live','grupos_vip','completo');
begin
  if not (auth.role() = 'service_role' or public.is_super_admin()) then raise exception 'forbidden'; end if;
  select * into t from tenants where id = _tenant_id for update;
  if t.id is null then return jsonb_build_object('credited', false, 'reason', 'empresa_nao_encontrada'); end if;
  nova := greatest(coalesce(t.subscription_ends_at, paid), paid) + make_interval(days => _days);
  insert into platform_pagarme_credits (payment_ref, tenant_id, plan_key, days, ends_before, ends_after, source)
  values (_payment_ref, _tenant_id, _plan_key, _days, t.subscription_ends_at, nova, _source)
  on conflict (payment_ref) do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return jsonb_build_object('credited', false, 'reason', 'ja_creditado'); end if;
  update tenants set
    subscription_ends_at = nova, is_blocked = false, updated_at = now(),
    plan_type = case when modulo then _plan_key else plan_type end,
    enable_live = case when modulo then _plan_key in ('live','completo') else enable_live end,
    enable_loja_live = case when modulo then _plan_key in ('live','completo') else enable_loja_live end,
    enable_sendflow = case when modulo then _plan_key in ('grupos_vip','completo') else enable_sendflow end
  where id = _tenant_id;
  return jsonb_build_object('credited', true, 'days', _days, 'ends_before', t.subscription_ends_at, 'ends_after', nova, 'plan_key', _plan_key);
end $$;
revoke all on function public.platform_pagarme_credit(uuid,text,timestamptz,text,integer,text) from public, anon;
grant execute on function public.platform_pagarme_credit(uuid,text,timestamptz,text,integer,text) to authenticated, service_role;

-- Descobre a empresa do pagador (mesma ordem de antes), sem efeito colateral: serve ao webhook e à conferência (simulação).
create or replace function public.platform_pagarme_resolve(
  _customer_id text, _subscription_id text, _email text, _phone text, _document text)
returns table(o_tenant_id uuid, o_matched_by text)
language plpgsql stable security definer set search_path to 'public' as $$
declare t uuid; mby text; d text := regexp_replace(coalesce(_document,''), '\D', '', 'g');
  e text := lower(trim(coalesce(_email,''))); w text := platform_norm_whatsapp(_phone);
begin
  if not (auth.role() = 'service_role' or public.is_super_admin()) then return; end if;
  select m.tenant_id, 'mapeamento' into t, mby from platform_pagarme_customer_map m
   where (nullif(_subscription_id,'') is not null and m.pagarme_subscription_id = _subscription_id)
      or (nullif(_customer_id,'') is not null and m.pagarme_customer_id = _customer_id)
   order by (m.pagarme_subscription_id = _subscription_id) desc nulls last limit 1;
  if t is null and length(d) in (11,14) then
    select case when count(distinct m.tenant_id) = 1 then min(m.tenant_id::text)::uuid end into t from platform_pagarme_customer_map m where m.document = d;
    if t is not null then mby := 'contratacao_documento'; end if;
  end if;
  if t is null and e like '%_@_%' then
    select case when count(distinct m.tenant_id) = 1 then min(m.tenant_id::text)::uuid end into t from platform_pagarme_customer_map m where m.email = e;
    if t is not null then mby := 'contratacao_email'; end if;
  end if;
  if t is null and w is not null then
    select case when count(distinct m.tenant_id) = 1 then min(m.tenant_id::text)::uuid end into t from platform_pagarme_customer_map m where m.phone_key = w;
    if t is not null then mby := 'contratacao_telefone'; end if;
  end if;
  if t is null then
    select x.tenant_id, x.matched_by into t, mby from platform_match_tenant_by_payer(_email, _phone, _document) x;
  end if;
  if t is not null then return query select t, mby; end if;
end $$;
revoke all on function public.platform_pagarme_resolve(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.platform_pagarme_resolve(text,text,text,text,text) to service_role;

-- Atribuição do pagamento à empresa: agora também credita os dias.
drop function if exists public.platform_payment_attribute(uuid,text,numeric,timestamptz,text,text,text);
create or replace function public.platform_payment_attribute(
  _tenant_id uuid, _payment_ref text, _amount numeric, _paid_at timestamptz, _customer_id text,
  _subscription_id text, _matched_by text, _plan_key text default null, _credit boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare res text; act boolean; cr jsonb := jsonb_build_object('credited', false, 'reason', 'sem_plano_do_link');
begin
  if not (auth.role() = 'service_role' or public.is_super_admin()) then raise exception 'forbidden'; end if;
  insert into platform_pagarme_customer_map (tenant_id, pagarme_customer_id, pagarme_subscription_id, matched_by)
  values (_tenant_id, nullif(_customer_id,''), nullif(_subscription_id,''), _matched_by) on conflict do nothing;
  act := platform_signup_activate(_tenant_id);
  if act then
    -- a ativação já deu o primeiro período; só registra para esta cobrança não creditar de novo
    insert into platform_pagarme_credits (payment_ref, tenant_id, plan_key, days, ends_before, ends_after, source)
    select _payment_ref, _tenant_id, _plan_key, 31, null, subscription_ends_at, 'ativacao' from tenants where id = _tenant_id
    on conflict (payment_ref) do nothing;
    cr := jsonb_build_object('credited', true, 'via', 'ativacao');
  elsif _credit then
    cr := platform_pagarme_credit(_tenant_id, _payment_ref, _paid_at, _plan_key, 31, 'pagamento');
  end if;
  res := platform_affiliate_record_commission(_tenant_id, _payment_ref, _amount, coalesce(_paid_at, now()));
  update platform_unmatched_payments set status = 'vinculado', tenant_id = _tenant_id, linked_at = now() where payment_ref = _payment_ref;
  update platform_affiliate_leads set status = 'pagando' where tenant_id = _tenant_id and status <> 'pagando' and affiliate_id is not null and res in ('criada','duplicada');
  return jsonb_build_object('matched', true, 'tenant_id', _tenant_id, 'matched_by', _matched_by, 'commission', res, 'activated', act, 'credit', cr);
end $$;
revoke all on function public.platform_payment_attribute(uuid,text,numeric,timestamptz,text,text,text,text,boolean) from public, anon;
grant execute on function public.platform_payment_attribute(uuid,text,numeric,timestamptz,text,text,text,text,boolean) to authenticated, service_role;

-- Entrada do webhook para pagamento sem empresa no corpo: acha a empresa, atribui e credita.
-- Só credita quando o plano do link foi identificado (_plan_key); sem plano conhecido, mantém o comportamento antigo.
drop function if exists public.platform_pagarme_payment(text,numeric,timestamptz,text,text,text,text,text,text);
create or replace function public.platform_pagarme_payment(
  _payment_ref text, _amount numeric, _paid_at timestamptz, _customer_id text, _subscription_id text,
  _email text, _phone text, _document text, _name text, _plan_key text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare t uuid; mby text;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select r.o_tenant_id, r.o_matched_by into t, mby
    from platform_pagarme_resolve(_customer_id, _subscription_id, _email, _phone, _document) r limit 1;
  if t is null then
    insert into platform_unmatched_payments (payment_ref, pagarme_customer_id, pagarme_subscription_id, amount, paid_at, customer_name, customer_email, customer_phone, customer_document, plan_key)
    values (_payment_ref, _customer_id, _subscription_id, coalesce(_amount,0), _paid_at, _name, _email, _phone, _document, _plan_key)
    on conflict (payment_ref) do nothing;
    return jsonb_build_object('matched', false);
  end if;
  return platform_payment_attribute(t, _payment_ref, _amount, _paid_at, _customer_id, _subscription_id, mby, _plan_key, _plan_key is not null);
end $$;
revoke all on function public.platform_pagarme_payment(text,numeric,timestamptz,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.platform_pagarme_payment(text,numeric,timestamptz,text,text,text,text,text,text,text) to service_role;

-- Vínculo manual (tela de afiliados): quem vincula decide, então sempre credita; sem plano gravado, 499 = Pacote Completo.
create or replace function public.platform_link_unmatched_payment(_unmatched_id uuid, _tenant_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare u platform_unmatched_payments%rowtype; p record; n int := 0; criadas int := 0; creditos int := 0; r jsonb;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into u from platform_unmatched_payments where id = _unmatched_id;
  if u.id is null then raise exception 'pagamento não encontrado'; end if;
  if not exists (select 1 from tenants where id = _tenant_id) then raise exception 'empresa não encontrada'; end if;
  for p in select * from platform_unmatched_payments
    where status = 'pendente' and (id = u.id
      or (u.pagarme_subscription_id is not null and pagarme_subscription_id = u.pagarme_subscription_id)
      or (u.pagarme_customer_id is not null and pagarme_customer_id = u.pagarme_customer_id))
    order by paid_at nulls last
  loop
    r := platform_payment_attribute(_tenant_id, p.payment_ref, p.amount, p.paid_at, p.pagarme_customer_id, p.pagarme_subscription_id, 'manual',
           coalesce(p.plan_key, case when p.amount = 499 then 'completo' end), true);
    n := n + 1;
    if r->>'commission' = 'criada' then criadas := criadas + 1; end if;
    if r->'credit'->>'credited' = 'true' then creditos := creditos + 1; end if;
  end loop;
  return jsonb_build_object('pagamentos', n, 'comissoes', criadas, 'creditos', creditos);
end $$;
