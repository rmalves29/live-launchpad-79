-- Promoções > Limite por cliente: em um período (início e fim), um ou vários produtos têm um máximo
-- de unidades por cliente. "Por produto" = máximo de cada um; "Somado" = máximo no total entre os produtos.
-- Vale para todos os canais (live, bazar pelo WhatsApp, pedido manual, Loja da Live, vitrine) porque é
-- conferido no banco, na entrada do item (cart_items). Conta só o que a cliente pediu dentro do período,
-- ignora pedidos cancelados e reconhece a cliente pelo telefone (phone_match_key).

create table if not exists public.purchase_limits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  product_ids bigint[] not null default '{}',
  max_qty integer not null check (max_qty > 0),
  scope text not null default 'per_product' check (scope in ('per_product', 'combined')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists purchase_limits_tenant_idx on public.purchase_limits (tenant_id, is_active, starts_at, ends_at);
create index if not exists purchase_limits_products_idx on public.purchase_limits using gin (product_ids);

alter table public.purchase_limits enable row level security;
drop policy if exists "Tenant manage purchase_limits" on public.purchase_limits;
create policy "Tenant manage purchase_limits" on public.purchase_limits
  for all using ((tenant_id = get_current_tenant_id()) or is_super_admin())
  with check ((tenant_id = get_current_tenant_id()) or is_super_admin());

-- Quanto a cliente ainda pode pedir de um produto agora (null = nenhuma regra ativa para ele).
-- p_exclude_item_id: ao alterar a quantidade de um item, não conta a quantidade antiga dele.
create or replace function public.purchase_limit_check(
  p_tenant_id uuid, p_phone text, p_product_id bigint, p_new_qty integer, p_exclude_item_id bigint default null
) returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_key text := phone_match_key(p_phone);
  l record;
  v_used integer;
  v_worst jsonb := null;
begin
  if p_phone is null or p_phone like '@%' or v_key is null or length(v_key) < 10 then
    return null;
  end if;

  for l in
    select * from purchase_limits
     where tenant_id = p_tenant_id and is_active and now() between starts_at and ends_at
       and p_product_id = any(product_ids)
  loop
    select coalesce(sum(ci.qty), 0) into v_used
      from cart_items ci
      join carts c on c.id = ci.cart_id
     where c.tenant_id = p_tenant_id
       and phone_match_key(c.customer_phone) = v_key
       and ci.created_at between l.starts_at and l.ends_at
       and (case when l.scope = 'combined' then ci.product_id = any(l.product_ids) else ci.product_id = p_product_id end)
       and (p_exclude_item_id is null or ci.id <> p_exclude_item_id)
       and not exists (select 1 from orders o where o.cart_id = c.id and coalesce(o.is_cancelled, false));

    if v_used + coalesce(p_new_qty, 0) > l.max_qty then
      if v_worst is null or (l.max_qty - v_used) < (v_worst->>'remaining')::int then
        v_worst := jsonb_build_object(
          'allowed', false, 'limit_id', l.id, 'limit_name', l.name, 'max', l.max_qty,
          'used', v_used, 'remaining', greatest(l.max_qty - v_used, 0), 'scope', l.scope,
          'ends_at', l.ends_at);
      end if;
    end if;
  end loop;

  return coalesce(v_worst, jsonb_build_object('allowed', true));
end $$;

grant execute on function public.purchase_limit_check(uuid, text, bigint, integer, bigint) to authenticated, service_role;

-- Barreira final: nenhum canal consegue passar do limite.
create or replace function public.enforce_purchase_limits()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_tenant uuid; v_phone text; v_res jsonb;
begin
  if TG_OP = 'UPDATE' and not (NEW.qty > OLD.qty) then
    return NEW;
  end if;

  select c.tenant_id, c.customer_phone into v_tenant, v_phone from carts c where c.id = NEW.cart_id;
  if v_tenant is null then return NEW; end if;
  if not exists (select 1 from purchase_limits where tenant_id = v_tenant and is_active and now() between starts_at and ends_at) then
    return NEW;
  end if;

  v_res := purchase_limit_check(v_tenant, v_phone, NEW.product_id, NEW.qty,
                                case when TG_OP = 'UPDATE' then NEW.id else null end);
  if v_res is not null and (v_res->>'allowed')::boolean = false then
    raise exception 'LIMITE_POR_CLIENTE|%|%|%|%|%', v_res->>'max', v_res->>'scope', v_res->>'remaining',
      coalesce(NEW.product_code, ''), coalesce(NEW.product_name, '')
      using errcode = 'check_violation';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_enforce_purchase_limits on public.cart_items;
create trigger trg_enforce_purchase_limits
  before insert or update of qty, product_id on public.cart_items
  for each row execute function public.enforce_purchase_limits();
