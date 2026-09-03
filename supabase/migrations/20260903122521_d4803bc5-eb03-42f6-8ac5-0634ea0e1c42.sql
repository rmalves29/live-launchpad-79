CREATE OR REPLACE FUNCTION public.auto_set_order_status_enviado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_posted IS TRUE
     AND OLD.tracking_posted IS DISTINCT FROM TRUE
     AND COALESCE(btrim(NEW.melhor_envio_tracking_code), '') <> ''
  THEN
    NEW.order_status := 'enviado';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_logistics_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_paid IS TRUE
     AND OLD.is_paid IS DISTINCT FROM TRUE
     AND NEW.paid_at IS NULL
  THEN
    NEW.paid_at := now();
  END IF;

  IF NEW.tracking_posted IS TRUE
     AND OLD.tracking_posted IS DISTINCT FROM TRUE
     AND COALESCE(btrim(NEW.melhor_envio_tracking_code), '') <> ''
     AND NEW.shipped_at IS NULL
  THEN
    NEW.shipped_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tr_orders_shipped_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_posted IS TRUE
     AND OLD.tracking_posted IS DISTINCT FROM TRUE
     AND COALESCE(btrim(NEW.melhor_envio_tracking_code), '') <> ''
     AND NEW.shipped_at IS NULL
  THEN
    NEW.shipped_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_order_status_enviado ON public.orders;
CREATE TRIGGER trg_auto_set_order_status_enviado
BEFORE UPDATE OF tracking_posted, melhor_envio_tracking_code ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_set_order_status_enviado();

DROP TRIGGER IF EXISTS tr_orders_shipped_at_update ON public.orders;
CREATE TRIGGER tr_orders_shipped_at_update
BEFORE UPDATE OF tracking_posted, melhor_envio_tracking_code ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.tr_orders_shipped_at();