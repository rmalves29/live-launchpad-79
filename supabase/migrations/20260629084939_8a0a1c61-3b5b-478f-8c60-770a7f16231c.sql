
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.send_tracking_whatsapp_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.melhor_envio_tracking_code IS NULL OR OLD.melhor_envio_tracking_code = '')
     AND NEW.melhor_envio_tracking_code IS NOT NULL
     AND NEW.melhor_envio_tracking_code != ''
  THEN
    PERFORM net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-tracking',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'order_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'tracking_code', NEW.melhor_envio_tracking_code,
        'shipped_at', now()::text
      )
    );
    RAISE LOG '[TRACKING-TRIGGER] Disparado envio WhatsApp (async) pedido #% rastreio %', NEW.id, NEW.melhor_envio_tracking_code;
  END IF;
  RETURN NEW;
END;
$function$;
