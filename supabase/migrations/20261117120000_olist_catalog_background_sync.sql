-- Olist: sincronização do catálogo em segundo plano (catálogos grandes, como 41 mil produtos).
-- A Olist limita a 60 leituras por minuto por conta; ler tudo no navegador não termina. Aqui o servidor lê aos poucos
-- (até 45 chamadas por minuto por empresa), guarda onde parou e continua na rodada seguinte do agendamento.
alter table public.integration_olist add column if not exists catalog_sync jsonb;
alter table public.integration_olist add column if not exists catalog_sync_running boolean not null default false;
alter table public.integration_olist add column if not exists catalog_sync_lock_at timestamptz;
alter table public.integration_olist add column if not exists catalog_sync_last_at timestamptz;
create index if not exists integration_olist_catalog_sync_idx
  on public.integration_olist (catalog_sync_last_at asc nulls first, tenant_id)
  where is_active and catalog_sync_running;

-- Rodada a cada minuto. Usa o mesmo segredo exclusivo do agendador da Olist (olist_cron_secret);
-- sem nenhuma empresa sincronizando, a rodada só faz uma consulta leve.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'olist_cron_secret') then
    raise exception 'Olist scheduler secret is missing';
  end if;
  perform cron.schedule('olist-catalog-sync', '* * * * *', $command$
    select net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/olist-products',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-olist-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'olist_cron_secret')
      ),
      body := jsonb_build_object('action', 'auto_catalog_sync'),
      timeout_milliseconds := 120000
    ) as request_id;
  $command$);
end $$;
