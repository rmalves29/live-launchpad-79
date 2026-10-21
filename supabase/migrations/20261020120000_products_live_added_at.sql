-- Ordem da vitrine da live: quem entra na live agora vai para o FIM da lista.
-- live_added_at = quando o produto passou a valer para a live (sale_type LIVE/AMBOS). Antes a lista era por updated_at,
-- então qualquer venda/estoque mexia a ordem e os produtos recém-ativados apareciam no topo.
alter table public.products add column if not exists live_added_at timestamptz;

-- Backfill (aplicado à parte, com session_replication_role = replica para não acionar auditoria nem mexer em updated_at):
--   update public.products set live_added_at = created_at where live_added_at is null and sale_type in ('LIVE','AMBOS');
-- Assim a ordem de hoje vira a ordem de cadastro, fixa; só quem for ativado a partir de agora entra no fim.

create or replace function public.products_set_live_added_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sale_type in ('LIVE', 'AMBOS') and (tg_op = 'INSERT' or old.sale_type is null or old.sale_type not in ('LIVE', 'AMBOS')) then
    new.live_added_at := now();
  end if;
  return new;
end $$;

drop trigger if exists products_set_live_added_at on public.products;
create trigger products_set_live_added_at
  before insert or update of sale_type on public.products
  for each row execute function public.products_set_live_added_at();

create index if not exists products_live_order_idx on public.products (tenant_id, is_live desc, live_added_at nulls first, id) where sale_type in ('LIVE', 'AMBOS');
