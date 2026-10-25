-- Depósito do Bling escolhido pela empresa: é dele que o Cartzy vai lançar, baixar e importar estoque.
-- Guardamos o ID (o nome pode mudar no Bling) e o nome só para exibir.
alter table public.integration_bling add column if not exists bling_deposit_id bigint;
alter table public.integration_bling add column if not exists bling_deposit_name text;
