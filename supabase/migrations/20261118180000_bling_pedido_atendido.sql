-- Opção por loja: enviar pedido ao Bling já como "Atendido", lançando o estoque no depósito escolhido
alter table public.integration_bling
  add column if not exists send_orders_attended boolean not null default false;
