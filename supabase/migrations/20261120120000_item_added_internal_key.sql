-- Etapa 4 · 4.1 (P-03) — a função zapi-send-item-added aceitava qualquer chamada da internet.
-- Passo 1 (este): chave interna + gatilhos mandando a chave + registro de quem chama (MODO OBSERVAÇÃO: nada é recusado).
-- Passo 2 (depois da Black Friday, só com o registro mostrando 100% das chamadas identificadas): ligar a trava na função.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.internal_keys (
  name       text primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
revoke all on private.internal_keys from public, anon, authenticated;

insert into private.internal_keys (name, key)
values ('item_added', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- Lida só pelos gatilhos (SECURITY DEFINER) e pela função (via internal_key_check).
create or replace function private.internal_key(p_name text)
returns text language sql stable security definer set search_path = private as $$
  select key from private.internal_keys where name = p_name
$$;
revoke all on function private.internal_key(text) from public, anon, authenticated;

-- A edge function confere a chave recebida sem nunca ler a chave em si.
create or replace function public.internal_key_check(p_name text, p_key text)
returns boolean language sql stable security definer set search_path = private as $$
  select coalesce(p_key, '') <> '' and exists (select 1 from private.internal_keys where name = p_name and key = p_key)
$$;
revoke all on function public.internal_key_check(text, text) from public, anon, authenticated;
grant execute on function public.internal_key_check(text, text) to service_role;

-- Registro de quem chama as funções internas/públicas (para decidir quando travar). Etapa 4.4 amplia para ~20 funções.
create table if not exists public.internal_call_audit (
  id         bigserial primary key,
  fn         text not null,
  caller     text not null,          -- service_role | internal_key | sem_chave
  user_agent text,
  allowed    boolean not null,
  user_id    uuid,                   -- quando a chamada vem de usuário logado (etapa 4.4, só registro)
  origin     text,                   -- origin/referer da chamada
  created_at timestamptz not null default now()
);
create index if not exists internal_call_audit_fn_idx on public.internal_call_audit (fn, created_at desc);
alter table public.internal_call_audit enable row level security;
drop policy if exists "super admin vê auditoria" on public.internal_call_audit;
create policy "super admin vê auditoria" on public.internal_call_audit for select to authenticated using (public.is_super_admin());
revoke insert, update, delete on public.internal_call_audit from anon, authenticated;

-- Gatilho 1: item adicionado (mesmo corpo de produção em 20/11/2026, só ganhou o header da chave)
CREATE OR REPLACE FUNCTION public.send_whatsapp_on_item_added()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
  v_customer_phone text;
  v_order_id bigint;
  v_source text;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.qty IS DISTINCT FROM NEW.qty OR OLD.product_id IS DISTINCT FROM NEW.product_id)) THEN
    SELECT customer_phone INTO v_customer_phone FROM public.carts WHERE id = NEW.cart_id;
    SELECT id, source INTO v_order_id, v_source FROM public.orders WHERE cart_id = NEW.cart_id ORDER BY id DESC LIMIT 1;

    IF v_source = 'live_shop' AND COALESCE((SELECT t.live_open_order FROM public.tenants t WHERE t.id = NEW.tenant_id), false) THEN
      RETURN NEW;
    END IF;

    payload := jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'customer_phone', v_customer_phone,
      'product_name', COALESCE(NEW.product_name, ''),
      'product_code', COALESCE(NEW.product_code, ''),
      'quantity', NEW.qty,
      'unit_price', NEW.unit_price,
      'cart_id', NEW.cart_id,
      'order_id', v_order_id
    );

    BEGIN
      PERFORM net.http_post(
        url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-item-added',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-cartzy-internal-key', COALESCE(private.internal_key('item_added'), '')),
        body := payload,
        timeout_milliseconds := 1500
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[send_whatsapp_on_item_added] http_post falhou (item gravado mesmo assim): %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Gatilho 2: fim da pausa de 30 min (mesmo corpo de produção em 20/11/2026, só ganhou o header da chave)
CREATE OR REPLACE FUNCTION public.item_added_flush_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in
    select distinct on (c.tenant_id) c.tenant_id, c.phone_key
      from public.item_added_cooldown c
      left join public.item_added_flush_slots s on s.tenant_id = c.tenant_id
     where c.due_at is not null and c.due_at <= now()
       and jsonb_array_length(c.pending_items) > 0
       and (s.last_flush_at is null or s.last_flush_at <= now() - interval '115 seconds')
     order by c.tenant_id, c.due_at
  loop
    declare
      v_items jsonb; v_body jsonb;
    begin
      select c.pending_items, c.pending_body into v_items, v_body
        from public.item_added_cooldown c
       where c.tenant_id = r.tenant_id and c.phone_key = r.phone_key
         and c.due_at is not null and jsonb_array_length(c.pending_items) > 0
       for update skip locked;
      if v_body is null then continue; end if;

      update public.item_added_cooldown
         set last_sent_at = now(), due_at = null, updated_at = now(),
             pending_items = '[]'::jsonb, pending_body = null
       where tenant_id = r.tenant_id and phone_key = r.phone_key;

      insert into public.item_added_flush_slots (tenant_id, last_flush_at) values (r.tenant_id, now())
      on conflict (tenant_id) do update set last_flush_at = excluded.last_flush_at;

      perform net.http_post(
        url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-item-added',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-cartzy-internal-key', COALESCE(private.internal_key('item_added'), '')),
        body := v_body || jsonb_build_object('flush', true, 'consolidated_items', v_items),
        timeout_milliseconds := 1500
      );
      n := n + 1;
    exception when others then
      raise log '[item_added_flush_tick] falhou para % %: %', r.tenant_id, r.phone_key, sqlerrm;
    end;
  end loop;
  return n;
end $function$;
