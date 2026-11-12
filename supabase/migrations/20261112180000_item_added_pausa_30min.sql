-- Regra anti-bloqueio da mensagem "item adicionado" (todas as empresas):
-- 1) O primeiro pedido da cliente manda a mensagem na hora e abre uma PAUSA de 30 minutos para ela.
-- 2) Pedidos feitos durante a pausa não mandam mensagem: os produtos ficam acumulados.
-- 3) Quando a pausa acaba, se a cliente pediu algo nela, sai UMA mensagem com todos os produtos juntos
--    e começa nova pausa. Se não pediu nada, não sai nada.
-- 4) Quando várias pausas da mesma loja vencem juntas, sai no máximo 1 mensagem a cada 2 minutos por loja.

create table if not exists public.item_added_cooldown (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_key text not null,                       -- DDD + 8 últimos dígitos (independe do 9º dígito / 55)
  last_sent_at timestamptz,                      -- início da pausa atual (último envio real)
  pending_items jsonb not null default '[]'::jsonb,
  pending_body jsonb,                            -- último pedido recebido na pausa (telefone, carrinho, pedido)
  due_at timestamptz,                            -- quando a mensagem acumulada pode sair
  updated_at timestamptz not null default now(),
  primary key (tenant_id, phone_key)
);
create index if not exists item_added_cooldown_due_idx on public.item_added_cooldown (due_at) where due_at is not null;
alter table public.item_added_cooldown enable row level security;

create table if not exists public.item_added_flush_slots (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  last_flush_at timestamptz not null
);
alter table public.item_added_flush_slots enable row level security;

-- Decide, de forma atômica, se a mensagem sai agora ('send') ou entra na fila da pausa ('deferred').
create or replace function public.item_added_claim(
  p_tenant_id uuid, p_phone_key text, p_cooldown_minutes int, p_item jsonb, p_body jsonb
) returns text
language plpgsql security definer set search_path to 'public'
as $$
declare r public.item_added_cooldown;
begin
  insert into public.item_added_cooldown (tenant_id, phone_key) values (p_tenant_id, p_phone_key)
  on conflict (tenant_id, phone_key) do nothing;

  select * into r from public.item_added_cooldown
   where tenant_id = p_tenant_id and phone_key = p_phone_key for update;

  -- Fora da pausa e sem nada acumulado: manda agora e abre a pausa.
  if (r.last_sent_at is null or r.last_sent_at < now() - make_interval(mins => p_cooldown_minutes))
     and jsonb_array_length(r.pending_items) = 0 then
    update public.item_added_cooldown
       set last_sent_at = now(), due_at = null, pending_body = null, updated_at = now()
     where tenant_id = p_tenant_id and phone_key = p_phone_key;
    return 'send';
  end if;

  -- Na pausa (ou com acumulado aguardando a vez): acumula.
  update public.item_added_cooldown
     set pending_items = pending_items || jsonb_build_array(p_item),
         pending_body  = p_body,
         due_at        = coalesce(due_at, coalesce(r.last_sent_at, now()) + make_interval(mins => p_cooldown_minutes)),
         updated_at    = now()
   where tenant_id = p_tenant_id and phone_key = p_phone_key;
  return 'deferred';
end $$;

-- Se o envio liberado não aconteceu (falha, consentimento, template desligado), desfaz a pausa.
create or replace function public.item_added_release(p_tenant_id uuid, p_phone_key text)
returns void language sql security definer set search_path to 'public'
as $$
  update public.item_added_cooldown set last_sent_at = null, updated_at = now()
   where tenant_id = p_tenant_id and phone_key = p_phone_key and jsonb_array_length(pending_items) = 0;
$$;

-- Roda a cada minuto: manda as mensagens acumuladas cuja pausa venceu (1 por loja a cada 2 minutos).
create or replace function public.item_added_flush_tick()
returns int language plpgsql security definer set search_path to 'public'
as $$
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
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_body || jsonb_build_object('flush', true, 'consolidated_items', v_items),
        timeout_milliseconds := 1500
      );
      n := n + 1;
    exception when others then
      raise log '[item_added_flush_tick] falhou para % %: %', r.tenant_id, r.phone_key, sqlerrm;
    end;
  end loop;
  return n;
end $$;

revoke all on function public.item_added_claim(uuid, text, int, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.item_added_release(uuid, text) from public, anon, authenticated;
revoke all on function public.item_added_flush_tick() from public, anon, authenticated;
grant execute on function public.item_added_claim(uuid, text, int, jsonb, jsonb) to service_role;
grant execute on function public.item_added_release(uuid, text) to service_role;

select cron.unschedule('item-added-flush-every-minute') where exists (select 1 from cron.job where jobname = 'item-added-flush-every-minute');
select cron.schedule('item-added-flush-every-minute', '* * * * *', $cron$ select public.item_added_flush_tick(); $cron$);
