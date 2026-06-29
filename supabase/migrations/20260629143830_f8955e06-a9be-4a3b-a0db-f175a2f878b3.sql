CREATE OR REPLACE FUNCTION public.send_whatsapp_on_item_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
  v_customer_phone text;
  v_order_id bigint;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.qty IS DISTINCT FROM NEW.qty OR OLD.product_id IS DISTINCT FROM NEW.product_id)) THEN
    -- Buscar telefone do carrinho e pedido associado (cart_items não possui essas colunas)
    SELECT customer_phone INTO v_customer_phone FROM public.carts WHERE id = NEW.cart_id;
    SELECT id INTO v_order_id FROM public.orders WHERE cart_id = NEW.cart_id ORDER BY id DESC LIMIT 1;

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

    -- Disparo assíncrono via http_post. A função zapi-send-item-added já roteia
    -- para Zapi ou Evolution conforme o provider configurado no tenant.
    -- Encapsulado em EXCEPTION para que a falha do WhatsApp NUNCA bloqueie a inclusão do item.
    BEGIN
      PERFORM net.http_post(
        url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-item-added',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := payload,
        timeout_milliseconds := 1500
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[send_whatsapp_on_item_added] http_post falhou (item gravado mesmo assim): %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;