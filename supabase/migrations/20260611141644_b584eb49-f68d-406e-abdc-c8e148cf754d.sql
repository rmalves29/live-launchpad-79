CREATE OR REPLACE FUNCTION public.send_whatsapp_on_item_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product RECORD;
  v_cart RECORD;
  v_qty_to_send INTEGER;
  v_supabase_url TEXT;
  v_request_id BIGINT;
BEGIN
  v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';

  IF TG_OP = 'UPDATE' THEN
    v_qty_to_send := NEW.qty - COALESCE(OLD.qty, 0);
    IF v_qty_to_send <= 0 THEN
      RETURN NEW;
    END IF;
  ELSE
    v_qty_to_send := NEW.qty;
  END IF;

  SELECT id, name, code, price, promotional_price
  INTO v_product
  FROM public.products
  WHERE id = NEW.product_id;

  IF NOT FOUND THEN
    RAISE LOG 'Produto não encontrado: %', NEW.product_id;
    RETURN NEW;
  END IF;

  SELECT customer_phone, tenant_id, id
  INTO v_cart
  FROM public.carts
  WHERE id = NEW.cart_id;

  IF NOT FOUND THEN
    RAISE LOG 'Carrinho não encontrado: %', NEW.cart_id;
    RETURN NEW;
  END IF;

  RAISE LOG 'Enfileirando WhatsApp Z-API - Produto: %, Tel: %, Tenant: %, Cart: %, QtdEnviada: % (TG_OP=%)',
    v_product.code, v_cart.customer_phone, v_cart.tenant_id, v_cart.id, v_qty_to_send, TG_OP;

  BEGIN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/zapi-send-item-added',
      body := jsonb_build_object(
        'tenant_id', v_cart.tenant_id,
        'customer_phone', v_cart.customer_phone,
        'product_name', v_product.name,
        'product_code', v_product.code,
        'quantity', v_qty_to_send,
        'unit_price', NEW.unit_price,
        'original_price', v_product.price,
        'cart_id', v_cart.id
      ),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 1000
    ) INTO v_request_id;

    RAISE LOG 'Z-API Item Added enfileirado - request_id: %', v_request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Erro ao enfileirar Z-API item added: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;