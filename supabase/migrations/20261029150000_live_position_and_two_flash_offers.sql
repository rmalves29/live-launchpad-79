-- Loja da Live: (1) ordem da vitrine escolhida pelo lojista; (2) até 2 ofertas relâmpago ao mesmo tempo.

-- ---------------------------------------------------------------- ordem da vitrine
-- live_position = posição escolhida (1, 2, 3...). Sem posição, vale a ordem de entrada na live (live_added_at).
-- Variações guardam a mesma posição do produto pai (a vitrine pagina e ordena linha a linha).
alter table public.products add column if not exists live_position integer;

-- Quem sai da live perde a posição; quem entra de novo vai para o fim (live_added_at é regravado).
create or replace function public.products_set_live_added_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sale_type in ('LIVE', 'AMBOS') and (tg_op = 'INSERT' or old.sale_type is null or old.sale_type not in ('LIVE', 'AMBOS')) then
    new.live_added_at := now();
    new.live_position := null;
  elsif tg_op = 'UPDATE' and new.sale_type not in ('LIVE', 'AMBOS') and old.sale_type in ('LIVE', 'AMBOS') then
    new.live_position := null;
  end if;
  return new;
end $$;

-- Move um produto para a posição N da vitrine e renumera os demais (1..K, sem buracos).
create or replace function public.set_live_position(p_product_id bigint, p_position integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.products
   where id = p_product_id and parent_product_id is null and is_active and sale_type in ('LIVE', 'AMBOS');
  if v_tenant is null then
    raise exception 'Produto não está na live';
  end if;
  if not (v_tenant = get_current_tenant_id() or is_super_admin()) then
    raise exception 'Sem permissão';
  end if;

  with others as (
    select id, row_number() over (order by live_position nulls last, live_added_at nulls last, id) as rn
      from public.products
     where tenant_id = v_tenant and is_active and parent_product_id is null
       and sale_type in ('LIVE', 'AMBOS') and id <> p_product_id
  ), target as (
    select greatest(1, least(coalesce(p_position, 1), (select count(*) + 1 from others)))::int as pos
  ), final as (
    select id, case when rn >= (select pos from target) then rn + 1 else rn end::int as np from others
    union all
    select p_product_id, (select pos from target)
  )
  update public.products p set live_position = f.np from final f where p.id = f.id;

  -- variações acompanham o produto pai
  update public.products c set live_position = p.live_position
    from public.products p
   where c.parent_product_id = p.id and p.tenant_id = v_tenant and c.tenant_id = v_tenant
     and p.live_position is not null and c.live_position is distinct from p.live_position;
end $$;

revoke all on function public.set_live_position(bigint, integer) from public, anon;
grant execute on function public.set_live_position(bigint, integer) to authenticated;

create index if not exists products_live_position_idx
  on public.products (tenant_id, live_position nulls last, live_added_at, id) where sale_type in ('LIVE', 'AMBOS');

-- ---------------------------------------------------------------- até 2 ofertas relâmpago
drop index if exists public.live_flash_offers_one_active;

-- o mesmo produto não pode ter duas ofertas no ar
create unique index if not exists live_flash_offers_one_active_per_product
  on public.live_flash_offers (tenant_id, product_id) where status = 'active';

create or replace function public.live_flash_offers_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'active' and (
    select count(*) from public.live_flash_offers o
     where o.tenant_id = new.tenant_id and o.status = 'active' and o.ends_at > now() and o.id <> new.id
  ) >= 2 then
    raise exception 'max_flash_offers: no máximo 2 ofertas relâmpago ao mesmo tempo';
  end if;
  return new;
end $$;

drop trigger if exists live_flash_offers_limit on public.live_flash_offers;
create trigger live_flash_offers_limit
  before insert or update of status on public.live_flash_offers
  for each row execute function public.live_flash_offers_limit();
