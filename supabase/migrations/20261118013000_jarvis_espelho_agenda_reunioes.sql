-- Reuniões marcadas pela Manuela (Jarvis: conversa no WhatsApp ou página /agenda) aparecem também na
-- agenda_reunioes, que é a agenda que o Rafael acompanha. Entram com origem 'jarvis' e SEM meet_link:
-- assim os envios automáticos da agenda_reunioes (AttendFlow, lembretes do site) não disparam —
-- os avisos dessas reuniões continuam com affiliate-meeting-reminders, pelo número da Manuela.
alter table public.agenda_reunioes add column if not exists jarvis_lead_id uuid;
create unique index if not exists agenda_reunioes_jarvis_lead_uidx on public.agenda_reunioes (jarvis_lead_id) where jarvis_lead_id is not null;

create or replace function public.jarvis_espelha_agenda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origem <> 'jarvis' then return new; end if;
  if new.meeting_at is not null and new.status = 'reuniao_agendada' then
    insert into public.agenda_reunioes (jarvis_lead_id, titulo, cliente_nome, cliente_telefone, cliente_email,
                                        inicio, duracao_min, status, origem, instagram, agendado_em, observacoes)
    values (new.id, 'Apresentação Cartzy (Manuela)', coalesce(new.nome, ''), coalesce(new.whatsapp, ''), new.email,
            new.meeting_at, 30, 'agendada', 'jarvis', new.instagram, now(),
            'Marcada pela Manuela (Jarvis)' || coalesce(' · ' || nullif(new.empresa, ''), ''))
    on conflict (jarvis_lead_id) where jarvis_lead_id is not null do update
      set inicio = excluded.inicio, status = 'agendada', cliente_nome = excluded.cliente_nome,
          cliente_telefone = excluded.cliente_telefone, cliente_email = excluded.cliente_email, cancelado_em = null;
  elsif tg_op = 'UPDATE' and old.meeting_at is not null and (new.meeting_at is null or new.status <> 'reuniao_agendada') then
    update public.agenda_reunioes set status = 'cancelada', cancelado_em = now()
     where jarvis_lead_id = new.id and status = 'agendada';
  end if;
  return new;
end $$;

drop trigger if exists jarvis_espelha_agenda on public.platform_affiliate_leads;
create trigger jarvis_espelha_agenda after insert or update of meeting_at, status, origem on public.platform_affiliate_leads
  for each row execute function public.jarvis_espelha_agenda();

-- Reuniões do Jarvis que já estão marcadas entram agora.
insert into public.agenda_reunioes (jarvis_lead_id, titulo, cliente_nome, cliente_telefone, cliente_email,
                                    inicio, duracao_min, status, origem, instagram, agendado_em, observacoes)
select l.id, 'Apresentação Cartzy (Manuela)', coalesce(l.nome, ''), coalesce(l.whatsapp, ''), l.email,
       l.meeting_at, 30, 'agendada', 'jarvis', l.instagram, now(), 'Marcada pela Manuela (Jarvis)'
  from public.platform_affiliate_leads l
 where l.origem = 'jarvis' and l.status = 'reuniao_agendada' and l.meeting_at > now()
on conflict (jarvis_lead_id) where jarvis_lead_id is not null do nothing;
