-- Contador de mensagens enviadas por automação (Fluxo de Envio > Automações)

-- Boas-vindas (entrada): conta cada envio bem-sucedido a partir daqui
alter table public.fe_auto_messages
  add column if not exists sent_count integer not null default 0,
  add column if not exists last_sent_at timestamptz;

create or replace function public.fe_auto_message_inc(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.fe_auto_messages
     set sent_count = sent_count + 1,
         last_sent_at = now()
   where id = p_id;
$$;

revoke all on function public.fe_auto_message_inc(uuid) from public, anon, authenticated;
grant execute on function public.fe_auto_message_inc(uuid) to service_role;

-- Saída/retorno: estatísticas por automação, calculadas do que já existe (respeita RLS)
create or replace view public.fe_return_automation_stats
with (security_invoker = true) as
select
  automation_id,
  count(*) filter (where invite_sent_at is not null) as invites_sent,
  count(*) filter (where status = 'rewarded') as returned
from public.fe_return_pending
group by automation_id;

grant select on public.fe_return_automation_stats to authenticated;

notify pgrst, 'reload schema';
