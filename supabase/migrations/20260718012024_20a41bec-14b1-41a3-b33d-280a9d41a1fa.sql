DO $$
DECLARE
  r RECORD;
  req_id BIGINT;
BEGIN
  FOR r IN SELECT id, raw_payload FROM whatsapp_webhook_orphans WHERE status LIKE 'uazapi_group_action_unresolved%' LOOP
    SELECT net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/uazapi-webhook',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := r.raw_payload::jsonb
    ) INTO req_id;
  END LOOP;
  DELETE FROM whatsapp_webhook_orphans WHERE status LIKE 'uazapi_group_action_unresolved%';
END $$;