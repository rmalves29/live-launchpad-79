-- A contagem de cliques, entradas e saídas da campanha começa nesta data (se vazia, na criação da campanha).
-- Serve para "zerar" os números sem apagar o histórico de eventos.
alter table public.fe_campaigns add column if not exists stats_since timestamptz;
comment on column public.fe_campaigns.stats_since is 'Início da contagem de cliques/entradas/saídas da campanha. Nulo = desde a criação.';
