-- Apply only after the deployed Olist function passes its authenticated dry run.
-- The existing schedule, active state, store settings and date cutoffs are preserved.
do $$
declare
  target_id bigint;
begin
  if (select count(*) from cron.job where jobname = 'olist-orders-sweep') <> 1 then
    raise exception 'Expected exactly one Olist orders scheduler';
  end if;
  if not exists (select 1 from vault.secrets where name = 'olist_cron_secret') then
    raise exception 'Olist scheduler secret is missing';
  end if;
  select jobid into target_id from cron.job where jobname = 'olist-orders-sweep';
  perform cron.alter_job(target_id, command := $command$
    select net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/olist-orders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-olist-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'olist_cron_secret')
      ),
      body := jsonb_build_object('action', 'auto_sweep'),
      timeout_milliseconds := 120000
    ) as request_id;
  $command$);
end $$;
