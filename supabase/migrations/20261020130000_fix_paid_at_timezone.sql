-- paid_at gravava a hora com 3h A MAIS: NOW() AT TIME ZONE 'UTC-3' (no padrão POSIX, "UTC-3" = UTC+3) virava timestamp sem fuso,
-- que ao ser gravado em timestamptz ficava 3h no futuro. A tela converte para Brasília, então todo horário "Pago HH:mm" saía +3h.
-- Correção: gravar o instante real (now()). A conversão para -03:00 continua só na exibição (formatBrasiliaDateTime).
-- Dados: foi aplicado à parte (com session_replication_role = replica, sem acionar triggers) um ajuste de -3h em todo paid_at >= 2026-08-01.
create or replace function public.tr_orders_paid_at() returns trigger language plpgsql as $f$
begin
  if new.is_paid is true and (old.is_paid is false or old.is_paid is null) then
    new.paid_at := now();
  end if;
  return new;
end $f$;
-- update public.orders set paid_at = paid_at - interval '3 hours' where paid_at is not null and paid_at >= timestamptz '2026-08-01 00:00:00+00';
