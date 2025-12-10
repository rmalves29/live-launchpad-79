-- Update the send_whatsapp_on_item_added function to use Z-API
CREATE OR REPLACE FUNCTION public.send_whatsapp_on_item_added()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product RECORD;
  v_cart RECORD;
  v_supabase_url TEXT;
  v_response http_response;
BEGIN
  v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
  
  SELECT id, name, code, price 
  INTO v_product
  FROM products 
  WHERE id = NEW.product_id;
  
  IF NOT FOUND THEN
    RAISE LOG 'Produto não encontrado: %', NEW.product_id;
    RETURN NEW;
  END IF;
  
  SELECT customer_phone, tenant_id
  INTO v_cart
  FROM carts
  WHERE id = NEW.cart_id;
  
  IF NOT FOUND THEN
    RAISE LOG 'Carrinho não encontrado: %', NEW.cart_id;
    RETURN NEW;
  END IF;
  
  RAISE LOG 'Enviando WhatsApp Z-API - Produto: %, Telefone: %, Tenant: %', 
    v_product.code, v_cart.customer_phone, v_cart.tenant_id;
  
  BEGIN
    SELECT * INTO v_response FROM http_post(
      v_supabase_url || '/functions/v1/zapi-send-item-added',
      jsonb_build_object(
        'tenant_id', v_cart.tenant_id,
        'customer_phone', v_cart.customer_phone,
        'product_name', v_product.name,
        'product_code', v_product.code,
        'quantity', NEW.qty,
        'unit_price', NEW.unit_price
      )::text,
      'application/json'
    );
    
    RAISE LOG 'Z-API Item Added - Status: %, Response: %', 
      v_response.status, 
      COALESCE(substring(v_response.content, 1, 200), 'N/A');
      
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Erro ao chamar Z-API item added: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$function$;

-- Update the process_paid_order function to use Z-API
CREATE OR REPLACE FUNCTION public.process_paid_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text;
  v_response http_response;
BEGIN
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN

    IF COALESCE(NEW.skip_paid_message, false) THEN
      INSERT INTO whatsapp_messages (
        tenant_id,
        phone,
        message,
        type,
        order_id,
        created_at
      ) VALUES (
        NEW.tenant_id,
        NEW.customer_phone,
        'Envio de confirmação de pagamento ignorado pelo usuário',
        'system_log',
        NEW.id,
        now()
      );

      UPDATE public.orders
      SET payment_confirmation_sent = false
      WHERE id = NEW.id;

      RETURN NEW;
    END IF;

    v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';

    BEGIN
      SELECT * INTO v_response FROM http_post(
        v_supabase_url || '/functions/v1/zapi-send-paid-order',
        jsonb_build_object(
          'order_id', NEW.id,
          'tenant_id', NEW.tenant_id
        )::text,
        'application/json'
      );

      INSERT INTO whatsapp_messages (
        tenant_id,
        phone,
        message,
        type,
        order_id,
        created_at
      ) VALUES (
        NEW.tenant_id,
        NEW.customer_phone,
        'Z-API zapi-send-paid-order chamada - Status: ' || COALESCE(v_response.status::text, 'NULL'),
        'system_log',
        NEW.id,
        now()
      );

      IF v_response.status = 200 THEN
        UPDATE public.orders
        SET payment_confirmation_sent = true
        WHERE id = NEW.id;
      ELSE
        UPDATE public.orders
        SET payment_confirmation_sent = false
        WHERE id = NEW.id;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO whatsapp_messages (
        tenant_id,
        phone,
        message,
        type,
        order_id,
        created_at
      ) VALUES (
        NEW.tenant_id,
        NEW.customer_phone,
        'ERRO ao chamar Z-API zapi-send-paid-order: ' || SQLERRM,
        'system_log',
        NEW.id,
        now()
      );

      UPDATE public.orders
      SET payment_confirmation_sent = false
      WHERE id = NEW.id;
    END;
  END IF;

  RETURN NEW;
END;
$function$;