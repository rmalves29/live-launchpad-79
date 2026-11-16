-- Olist: o catálogo guardado passa a trazer o preço promocional do produto (precos.precoPromocional).
-- 0 = sem promoção. A função olist-products funciona com ou sem esta coluna.
alter table public.olist_catalog add column if not exists preco_promocional numeric not null default 0;
