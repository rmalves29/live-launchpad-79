-- 1. Add scheduled_at column to sending_jobs
ALTER TABLE sending_jobs ADD COLUMN scheduled_at timestamptz NULL;

-- 2. Update status check constraint to allow 'scheduled'
ALTER TABLE sending_jobs DROP CONSTRAINT sending_jobs_status_check;
ALTER TABLE sending_jobs ADD CONSTRAINT sending_jobs_status_check 
  CHECK (status = ANY (ARRAY['running'::text, 'paused'::text, 'completed'::text, 'cancelled'::text, 'error'::text, 'scheduled'::text]));

-- 3. Cron job to check scheduled sendflow jobs every minute
SELECT cron.schedule(
  'sendflow-check-scheduled',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/sendflow-check-scheduled',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
