-- Varredura de produtos excluídos no Bling: desativa e zera o estoque no Cartzy (de hora em hora).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'bling-sweep-deleted-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-sweep-deleted',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
