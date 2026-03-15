SELECT cron.schedule(
  'fe-process-scheduled',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/fe-process-scheduled',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
