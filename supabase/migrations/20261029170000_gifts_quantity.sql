-- Brindes com quantidade limitada. Vazio (null) = sem limite.
-- O saldo é calculado em live-shop: quantity menos os pedidos da live não cancelados que levaram o brinde (orders.gift_name).
alter table public.gifts add column if not exists quantity integer check (quantity is null or quantity >= 0);
