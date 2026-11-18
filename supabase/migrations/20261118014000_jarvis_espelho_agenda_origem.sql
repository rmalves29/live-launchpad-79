-- agenda_reunioes aceita origem 'jarvis' e o espelho nunca impede o agendamento (erro vira só aviso).
alter table public.agenda_reunioes drop constraint if exists agenda_reunioes_origem_check;
alter table public.agenda_reunioes add constraint agenda_reunioes_origem_check check (origem = any (array['manual','site','jarvis']));

create or replace function public.jarvis_espelha_agenda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origem <> 'jarvis' then return new; end if;
  begin
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
  exception when others then
    raise warning 'jarvis_espelha_agenda (lead %): %', new.id, sqlerrm;
  end;
  return new;
end $$;
