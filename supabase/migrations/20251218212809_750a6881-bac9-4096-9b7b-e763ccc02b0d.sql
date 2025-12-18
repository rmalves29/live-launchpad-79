-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Criar cron job para sincronização de rastreios às 20h (horário de Brasília = 23h UTC)
SELECT cron.schedule(
  'sync-tracking-daily',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/sync-tracking-codes',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);