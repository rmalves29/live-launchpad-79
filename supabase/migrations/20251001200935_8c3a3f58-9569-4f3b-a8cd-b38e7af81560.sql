-- Modificar trigger process_paid_order para enviar via Node.js local
CREATE OR REPLACE FUNCTION public.process_paid_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_http_response record;
  v_node_url text;
  v_shipping_integration record;
  v_template record;
  v_message text;
BEGIN
  -- Só processar se o pedido foi marcado como pago agora
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    
    -- Buscar template de pedido pago
    SELECT * INTO v_template 
    FROM whatsapp_templates 
    WHERE tenant_id = NEW.tenant_id 
      AND type = 'PAID_ORDER'
    LIMIT 1;
    
    -- Construir mensagem
    IF v_template IS NOT NULL THEN
      v_message := v_template.content;
      v_message := replace(v_message, '{{order_id}}', NEW.id::text);
      v_message := replace(v_message, '{{total}}', to_char(NEW.total_amount, 'FM999999990.00'));
      v_message := replace(v_message, '{{customer_name}}', COALESCE(NEW.customer_name, 'Cliente'));
    ELSE
      -- Fallback se não houver template
      v_message := '🎉 *Pagamento Confirmado - Pedido #' || NEW.id || '*' || E'\n\n' ||
                   '✅ Recebemos seu pagamento!' || E'\n' ||
                   '💰 Valor: *R$ ' || to_char(NEW.total_amount, 'FM999999990.00') || '*' || E'\n\n' ||
                   'Seu pedido está sendo preparado para envio.' || E'\n\n' ||
                   'Obrigado pela preferência! 💚';
    END IF;
    
    -- Log para monitoramento
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
      'Pedido #' || NEW.id || ' marcado como pago - Enviando mensagem de confirmação',
      'system_log',
      NEW.id,
      now()
    );

    -- Verificar se existe integração ativa do Melhor Envio
    SELECT * INTO v_shipping_integration 
    FROM shipping_integrations 
    WHERE tenant_id = NEW.tenant_id 
      AND provider = 'melhor_envio' 
      AND is_active = true 
      AND access_token IS NOT NULL;

    -- Se existe integração ativa, criar remessa no Melhor Envio
    IF FOUND THEN
      BEGIN
        SELECT * INTO v_http_response FROM http_post(
          'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/melhor-envio-labels',
          jsonb_build_object(
            'action', 'create_shipment',
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
          'Criação de remessa ME - Status: ' || v_http_response.status,
          'system_log',
          NEW.id,
          now()
        );
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
          'Erro ao criar remessa ME: ' || SQLERRM,
          'system_log',
          NEW.id,
          now()
        );
      END;
    END IF;
    
    -- Enviar mensagem via Node.js local
    BEGIN
      v_node_url := 'http://localhost:3333';
      
      SELECT * INTO v_http_response FROM http_post(
        v_node_url || '/send',
        jsonb_build_object(
          'number', NEW.customer_phone,
          'message', v_message
        )::text,
        'application/json'
      );
      
      INSERT INTO whatsapp_messages (
        tenant_id,
        phone,
        message,
        type,
        order_id,
        created_at,
        sent_at
      ) VALUES (
        NEW.tenant_id,
        NEW.customer_phone,
        v_message,
        'outgoing',
        NEW.id,
        now(),
        now()
      );
      
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
        'Erro ao enviar mensagem via Node.js: ' || SQLERRM,
        'system_log',
        NEW.id,
        now()
      );
    END;
    
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Modificar trigger send_product_canceled_message para enviar via Node.js local
CREATE OR REPLACE FUNCTION public.send_product_canceled_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_template record;
  v_message text;
  v_product record;
  v_customer_phone text;
  v_http_response record;
  v_node_url text;
BEGIN
  -- Buscar informações do produto
  SELECT name INTO v_product
  FROM products
  WHERE id = OLD.product_id;
  
  -- Buscar telefone do cliente do carrinho
  SELECT customer_phone INTO v_customer_phone
  FROM carts
  WHERE id = OLD.cart_id;
  
  -- Buscar template PRODUCT_CANCELED
  SELECT * INTO v_template 
  FROM whatsapp_templates 
  WHERE tenant_id = OLD.tenant_id 
    AND type = 'PRODUCT_CANCELED'
  LIMIT 1;
  
  -- Construir mensagem
  IF v_template IS NOT NULL THEN
    v_message := v_template.content;
    v_message := replace(v_message, '{{produto}}', v_product.name);
  ELSE
    v_message := '❌ *Produto Cancelado*' || E'\n\n' ||
                 'O produto "' || v_product.name || '" foi cancelado do seu pedido.' || E'\n\n' ||
                 'Qualquer dúvida, entre em contato conosco.';
  END IF;
  
  -- Enviar mensagem via Node.js local
  BEGIN
    v_node_url := 'http://localhost:3333';
    
    SELECT * INTO v_http_response FROM http_post(
      v_node_url || '/send',
      jsonb_build_object(
        'number', v_customer_phone,
        'message', v_message
      )::text,
      'application/json'
    );
    
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      created_at,
      sent_at
    ) VALUES (
      OLD.tenant_id,
      v_customer_phone,
      v_message,
      'outgoing',
      now(),
      now()
    );
    
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      created_at
    ) VALUES (
      OLD.tenant_id,
      v_customer_phone,
      'Erro ao enviar PRODUCT_CANCELED via Node.js: ' || SQLERRM,
      'system_log',
      now()
    );
  END;
  
  RETURN OLD;
END;
$function$;