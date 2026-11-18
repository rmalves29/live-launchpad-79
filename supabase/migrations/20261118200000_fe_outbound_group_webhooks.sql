-- Aviso externo de entrada/saída de grupos (Fluxo de Envio) por empresa.
-- Cada empresa pode ter endereços (webhooks) que recebem, a cada evento gravado
-- em fe_group_events, um POST JSON: { "event": "join"|"leave", "phone": "<DDD+número>", "group_jid": "...", "occurred_at": "..." }.
-- Uso atual: Indique e Ganhe da Mania de Mulher (confirma a indicação quando a amiga entra no grupo).
--
-- Regras:
-- - eventos anônimos (phone 'unknown-*') não são enviados;
-- - 'leave' só é enviado se a pessoa não estiver em nenhum outro grupo da mesma empresa
--   (a empresa pode ter centenas de grupos; sair de um não significa sair da comunidade);
-- - o envio é assíncrono (pg_net) e qualquer erro é engolido: nunca bloqueia o registro do evento.
-- A tabela não tem políticas de RLS: só service role / SQL acessam (o endereço costuma levar chave de acesso).

create table if not exists public.fe_outbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null default 'webhook',
  url text not null,
  send_leave boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists fe_outbound_webhooks_tenant_idx
  on public.fe_outbound_webhooks (tenant_id) where active;
alter table public.fe_outbound_webhooks enable row level security;

create index if not exists idx_fe_group_events_tenant_phone
  on public.fe_group_events (tenant_id, phone, group_jid, created_at desc);

create or replace function public.fe_forward_group_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  w record;
  still_member boolean;
begin
  if new.phone is null or new.phone like 'unknown-%' or new.event_type not in ('join', 'leave') then
    return new;
  end if;

  if not exists (select 1 from public.fe_outbound_webhooks where tenant_id = new.tenant_id and active) then
    return new;
  end if;

  if new.event_type = 'leave' then
    select exists (
      select 1
        from (
          select distinct on (e.group_jid) e.event_type
            from public.fe_group_events e
           where e.tenant_id = new.tenant_id
             and e.phone = new.phone
             and e.group_jid <> new.group_jid
           order by e.group_jid, e.created_at desc
        ) last_per_group
       where last_per_group.event_type = 'join'
    ) into still_member;
  end if;

  for w in
    select url, send_leave from public.fe_outbound_webhooks
     where tenant_id = new.tenant_id and active
  loop
    if new.event_type = 'leave' and (not w.send_leave or coalesce(still_member, false)) then
      continue;
    end if;
    perform net.http_post(
      url := w.url,
      body := jsonb_build_object(
        'event', new.event_type,
        'phone', new.phone,
        'group_jid', new.group_jid,
        'occurred_at', coalesce(new.created_at, now())
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  end loop;

  return new;
exception when others then
  raise warning 'fe_forward_group_event: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function public.fe_forward_group_event() from public, anon, authenticated;

drop trigger if exists fe_forward_group_event_after_insert on public.fe_group_events;
create trigger fe_forward_group_event_after_insert
  after insert on public.fe_group_events
  for each row execute function public.fe_forward_group_event();
