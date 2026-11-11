-- Loja da Live: guardar quando o produto SAIU da live, para mostrar primeiro os últimos usados.
-- live_removed_at = última vez que o produto deixou de valer para a live (sale_type saiu de LIVE/AMBOS).
-- Não há histórico antigo: só vale para o que sair da live a partir de agora.
alter table public.products add column if not exists live_removed_at timestamptz;

create or replace function public.products_set_live_added_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sale_type in ('LIVE', 'AMBOS') and (tg_op = 'INSERT' or old.sale_type is null or old.sale_type not in ('LIVE', 'AMBOS')) then
    new.live_added_at := now();
    new.live_position := null;
  elsif tg_op = 'UPDATE' and new.sale_type not in ('LIVE', 'AMBOS') and old.sale_type in ('LIVE', 'AMBOS') then
    new.live_position := null;
    new.live_removed_at := now();
  end if;
  return new;
end $$;

create index if not exists products_live_removed_idx
  on public.products (tenant_id, live_removed_at desc)
  where live_removed_at is not null;
