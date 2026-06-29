CREATE OR REPLACE FUNCTION public.send_whatsapp_on_item_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
  supabase_url text;
  service_key text;
  v_customer_phone text;
  v_order_id bigint;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.qty IS DISTINCT FROM NEW.qty OR OLD.product_id IS DISTINCT FROM NEW.product_id)) THEN
    -- Buscar telefone do carrinho e pedido associado (cart_items não possui essas colunas)
    SELECT customer_phone INTO v_customer_phone FROM public.carts WHERE id = NEW.cart_id;
    SELECT id INTO v_order_id FROM public.orders WHERE cart_id = NEW.cart_id ORDER BY id DESC LIMIT 1;

    supabase_url := current_setting('app.supabase_url', true);
    service_key := current_setting('app.service_role_key', true);

    payload := jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'customer_phone', v_customer_phone,
      'product_name', COALESCE(NEW.product_name, ''),
      'product_code', COALESCE(NEW.product_code, ''),
      'quantity', NEW.qty,
      'unit_price', NEW.unit_price,
      'cart_id', NEW.cart_id,
      'order_id', v_order_id
    );

    BEGIN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/zapi-send-item-added-v4',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := payload,
        timeout_milliseconds := 1000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[send_whatsapp_on_item_added] http_post falhou: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;