CREATE OR REPLACE FUNCTION public.send_tracking_whatsapp_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.melhor_envio_tracking_code IS NOT NULL
     AND NEW.melhor_envio_tracking_code <> ''
     AND NEW.tracking_posted IS TRUE
     AND (
       OLD.melhor_envio_tracking_code IS NULL
       OR OLD.melhor_envio_tracking_code = ''
       OR OLD.tracking_posted IS DISTINCT FROM TRUE
     )
  THEN
    PERFORM net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-tracking',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'order_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'tracking_code', NEW.melhor_envio_tracking_code,
        'shipped_at', COALESCE(NEW.shipped_at, now())::text
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_tracking_whatsapp_on_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_tracking_whatsapp_on_update() TO service_role;