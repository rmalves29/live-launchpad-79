-- Automação de live do TikTok (teste na OrderZap).
-- Um programa no computador da loja lê os comentários da live e manda cada um para a
-- edge function tiktok-live-comment (autenticada por chave da empresa). O pedido usa as
-- mesmas tabelas da live do Instagram (carts / cart_items / orders); o WhatsApp sai pelo
-- número da empresa conectado no Cartzy, pelo gatilho send_whatsapp_on_item_added.
-- O @ do TikTok da cliente fica em customers.tiktok (mesmo cadastro usado no checkout).

-- 1) Configuração por empresa (ligada só na OrderZap neste teste)
create table if not exists public.tiktok_live_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  reader_key text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  reserve_hours integer not null default 3 check (reserve_hours between 1 and 48),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_tiktok_live_settings_key on public.tiktok_live_settings (reader_key);

-- 2) Sessões de live
create table if not exists public.tiktok_live_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tiktok_live_username text not null,
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_comment_at timestamptz
);
create index if not exists idx_tiktok_live_sessions_tenant on public.tiktok_live_sessions (tenant_id, started_at desc);

-- 3) Comentários com código de produto (log + idempotência + reservas pendentes)
--    status: no_code | not_found | not_for_live | out_of_stock | blocked | added | pendente | confirmado | expirado
create table if not exists public.tiktok_live_comments (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.tiktok_live_sessions(id) on delete cascade,
  comment_key text not null,
  tiktok_user_id text,
  tiktok_username text not null,
  comment_text text,
  product_code text,
  product_id bigint,
  product_name text,
  qty integer not null default 1,
  status text not null,
  order_id bigint,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_tiktok_live_comments_key on public.tiktok_live_comments (session_id, comment_key);
create index if not exists idx_tiktok_live_comments_session on public.tiktok_live_comments (session_id, created_at desc);
create index if not exists idx_tiktok_live_comments_pending on public.tiktok_live_comments (tenant_id, lower(tiktok_username)) where status = 'pendente';

-- RLS: equipe da empresa lê (e o admin edita a configuração); escrita dos comentários só pela edge function (service role).
alter table public.tiktok_live_settings enable row level security;
alter table public.tiktok_live_sessions enable row level security;
alter table public.tiktok_live_comments enable row level security;

drop policy if exists "tiktok settings select" on public.tiktok_live_settings;
create policy "tiktok settings select" on public.tiktok_live_settings for select
  using (is_super_admin() or (is_tenant_admin() and tenant_id = get_current_tenant_id()));
drop policy if exists "tiktok settings update" on public.tiktok_live_settings;
create policy "tiktok settings update" on public.tiktok_live_settings for update
  using (is_super_admin() or (is_tenant_admin() and tenant_id = get_current_tenant_id()))
  with check (is_super_admin() or (is_tenant_admin() and tenant_id = get_current_tenant_id()));

drop policy if exists "tiktok sessions select" on public.tiktok_live_sessions;
create policy "tiktok sessions select" on public.tiktok_live_sessions for select
  using (is_super_admin() or tenant_id = get_current_tenant_id());
drop policy if exists "tiktok sessions update" on public.tiktok_live_sessions;
create policy "tiktok sessions update" on public.tiktok_live_sessions for update
  using (is_super_admin() or tenant_id = get_current_tenant_id())
  with check (is_super_admin() or tenant_id = get_current_tenant_id());

drop policy if exists "tiktok comments select" on public.tiktok_live_comments;
create policy "tiktok comments select" on public.tiktok_live_comments for select
  using (is_super_admin() or tenant_id = get_current_tenant_id());

revoke all on public.tiktok_live_settings, public.tiktok_live_sessions, public.tiktok_live_comments from anon;

-- 4) Ao cadastrar o @ do TikTok, os pedidos guardados no @ passam para o telefone dela.
--    Pedidos pendentes ficam com customer_phone = '@tiktok:usuario' (não colide com o @ do Instagram).
create or replace function public.link_tiktok_orders(p_tenant_id uuid, p_tiktok text, p_phone text)
returns bigint[]
language plpgsql security definer set search_path = public
as $$
declare
  v_handle text := lower('@tiktok:' || regexp_replace(trim(p_tiktok), '^@+', ''));
  v_orders bigint[];
begin
  update public.carts set customer_phone = p_phone
   where tenant_id = p_tenant_id and status = 'OPEN' and lower(customer_phone) = v_handle;

  with upd as (
    update public.orders set customer_phone = p_phone
     where tenant_id = p_tenant_id and is_paid = false
       and coalesce(is_cancelled, false) = false
       and lower(customer_phone) = v_handle
    returning id
  ) select coalesce(array_agg(id), '{}') into v_orders from upd;

  update public.tiktok_live_comments set status = 'confirmado'
   where tenant_id = p_tenant_id and status = 'pendente'
     and lower(tiktok_username) = lower(regexp_replace(trim(p_tiktok), '^@+', ''));

  return v_orders;
end;
$$;
revoke all on function public.link_tiktok_orders(uuid, text, text) from public, anon, authenticated;
grant execute on function public.link_tiktok_orders(uuid, text, text) to service_role;

-- 5) Cadastro (@ do TikTok + telefone). Chamado pela edge function tiktok-register (que aplica limite por IP).
--    Por segurança, um @ já cadastrado NÃO tem o telefone trocado por quem não é a dona (senão alguém
--    desviaria os pedidos de outra pessoa digitando o @ dela); o mesmo vale no cadastro do Instagram.
create or replace function public.tiktok_register_customer(p_tenant_slug text, p_tiktok text, p_phone text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_handle text := lower(regexp_replace(regexp_replace(trim(coalesce(p_tiktok, '')), '^@+', ''), '\s+', '', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_by_tt record;
  v_by_phone record;
  v_orders bigint[];
begin
  if v_handle = '' or length(v_handle) > 60 or v_handle !~ '^[a-z0-9._]+$' then
    return jsonb_build_object('success', false, 'error', 'Informe um @ do TikTok válido');
  end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then
    return jsonb_build_object('success', false, 'error', 'Informe um telefone válido com DDD');
  end if;

  select id into v_tenant_id from public.tenants where slug = lower(trim(p_tenant_slug)) and is_active = true;
  if v_tenant_id is null then
    return jsonb_build_object('success', false, 'error', 'Loja não encontrada');
  end if;

  select id, phone into v_by_tt from public.customers
   where tenant_id = v_tenant_id and lower(tiktok) = v_handle limit 1;
  if v_by_tt.id is not null then
    if regexp_replace(coalesce(v_by_tt.phone, ''), '\D', '', 'g') = v_phone then
      v_orders := public.link_tiktok_orders(v_tenant_id, v_handle, v_by_tt.phone);
      return jsonb_build_object('success', true, 'tenant_id', v_tenant_id, 'phone', v_by_tt.phone, 'orders', to_jsonb(v_orders), 'already', true);
    end if;
    return jsonb_build_object('success', false, 'error', 'Esse @ já está cadastrado com outro telefone. Fale com a loja.');
  end if;

  select id, phone, tiktok into v_by_phone from public.customers
   where tenant_id = v_tenant_id and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone limit 1;
  if v_by_phone.id is not null then
    if coalesce(btrim(v_by_phone.tiktok), '') <> '' then
      return jsonb_build_object('success', false, 'error', 'Esse telefone já está ligado a outro @ do TikTok. Fale com a loja.');
    end if;
    update public.customers set tiktok = v_handle, updated_at = now() where id = v_by_phone.id;
    v_orders := public.link_tiktok_orders(v_tenant_id, v_handle, v_by_phone.phone);
    return jsonb_build_object('success', true, 'tenant_id', v_tenant_id, 'phone', v_by_phone.phone, 'orders', to_jsonb(v_orders));
  end if;

  insert into public.customers (tenant_id, tiktok, phone, name) values (v_tenant_id, v_handle, v_phone, '@' || v_handle);
  v_orders := public.link_tiktok_orders(v_tenant_id, v_handle, v_phone);
  return jsonb_build_object('success', true, 'tenant_id', v_tenant_id, 'phone', v_phone, 'orders', to_jsonb(v_orders));
end;
$$;
revoke all on function public.tiktok_register_customer(text, text, text) from public, anon, authenticated;
grant execute on function public.tiktok_register_customer(text, text, text) to service_role;

-- 6) Reserva vencida: cancela o pedido que continua sem cadastro e devolve o estoque.
create or replace function public.tiktok_expire_pending()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select c.order_id
      from public.tiktok_live_comments c
     where c.status = 'pendente' and c.order_id is not null
     group by c.order_id
    having max(c.expires_at) < now()
  loop
    if exists (select 1 from public.orders o where o.id = r.order_id and o.is_paid = false
                 and coalesce(o.is_cancelled, false) = false and o.customer_phone like '@tiktok:%') then
      perform public.restore_order_stock(r.order_id);
      update public.orders
         set is_cancelled = true,
             observation = trim(coalesce(observation, '') || ' Cancelado: reserva da live TikTok expirou sem cadastro da cliente.')
       where id = r.order_id and is_paid = false;
      update public.carts set status = 'CLOSED'
       where id = (select cart_id from public.orders where id = r.order_id) and status = 'OPEN';
      v_count := v_count + 1;
    end if;
    update public.tiktok_live_comments set status = 'expirado'
     where order_id = r.order_id and status = 'pendente';
  end loop;
  return v_count;
end;
$$;
revoke all on function public.tiktok_expire_pending() from public, anon, authenticated;
grant execute on function public.tiktok_expire_pending() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'tiktok-expire-pending') then
    perform cron.schedule('tiktok-expire-pending', '*/5 * * * *', 'select public.tiktok_expire_pending()');
  end if;
end $$;

-- 7) Teste só na OrderZap: liga a automação e o item de menu.
insert into public.tiktok_live_settings (tenant_id, enabled)
select id, true from public.tenants where slug = 'orderzap'
on conflict (tenant_id) do update set enabled = true;

update public.tenants
   set menu_flags = coalesce(menu_flags, '{}'::jsonb) || '{"tiktok_automacao": true}'::jsonb
 where slug = 'orderzap';
