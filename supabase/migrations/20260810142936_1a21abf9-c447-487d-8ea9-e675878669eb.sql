CREATE OR REPLACE FUNCTION public.tr_orders_shipped_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    IF COALESCE(btrim(NEW.melhor_envio_tracking_code), '') <> ''
       AND COALESCE(btrim(OLD.melhor_envio_tracking_code), '') = ''
       AND NEW.shipped_at IS NULL THEN
        NEW.shipped_at := now();
    END IF;
    RETURN NEW;
END;
$function$;