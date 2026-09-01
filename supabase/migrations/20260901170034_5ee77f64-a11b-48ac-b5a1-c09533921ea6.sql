-- lovable-cron-fallback-reviewed: 48 runs/day; reconciliação de postagem para Mandaê/SuperFrete que não possuem webhook de eventos
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_posted boolean NOT NULL DEFAULT false;

UPDATE public.orders SET tracking_posted = true WHERE melhor_envio_tracking_code IS NOT NULL AND melhor_envio_tracking_code <> '';

CREATE OR REPLACE FUNCTION public.send_tracking_whatsapp_on_update()
RETURNS trigger AS $$
BEGIN
  IF NEW.melhor_envio_tracking_code IS NOT NULL
     AND NEW.melhor_envio_tracking_code <> ''
     AND NEW.tracking_posted = true
     AND (OLD.melhor_envio_tracking_code IS NULL OR OLD.melhor_envio_tracking_code = '' OR OLD.tracking_posted = false)
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
    RAISE LOG '[TRACKING-TRIGGER] Envio WhatsApp (postado) pedido % - rastreio %', NEW.id, NEW.melhor_envio_tracking_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_send_tracking_whatsapp ON public.orders;
CREATE TRIGGER trg_send_tracking_whatsapp
  AFTER UPDATE OF melhor_envio_tracking_code, tracking_posted ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.send_tracking_whatsapp_on_update();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tracking-posted-sync') THEN
    PERFORM cron.schedule('tracking-posted-sync', '*/30 * * * *',
      $CRON$
      SELECT net.http_post(
        url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/tracking-posted-sync',
        headers := jsonb_build_object('Content-Type','application/json'),
        body := jsonb_build_object('trigger','cron')
      );
      $CRON$);
  END IF;
END $$;