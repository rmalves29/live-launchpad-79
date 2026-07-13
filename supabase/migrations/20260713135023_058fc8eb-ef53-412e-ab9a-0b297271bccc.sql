
-- 1) Fechar leitura pública global de cart_items (edge functions usam service_role, não afetadas)
DROP POLICY IF EXISTS "Public can view cart items" ON public.cart_items;

-- 2) Retenção mais frequente para evitar picos de tamanho
SELECT cron.unschedule('cleanup-webhook-logs-monthly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-webhook-logs-monthly');

SELECT cron.schedule(
  'cleanup-webhook-logs-daily',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/cleanup-webhook-logs',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4"}'::jsonb,
    body := '{"retention_days": 30, "folder_id": "1_VbPMQAci0g6knmx1fLbONwraB-m2hyo"}'::jsonb
  );
  $$
);

SELECT cron.unschedule('cleanup-fe-group-events-trimestral')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-fe-group-events-trimestral');

SELECT cron.schedule(
  'cleanup-fe-group-events-weekly',
  '30 3 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/cleanup-fe-group-events',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4"}'::jsonb,
    body := '{"retention_days": 90, "folder_id": "1_VbPMQAci0g6knmx1fLbONwraB-m2hyo"}'::jsonb
  );
  $$
);
