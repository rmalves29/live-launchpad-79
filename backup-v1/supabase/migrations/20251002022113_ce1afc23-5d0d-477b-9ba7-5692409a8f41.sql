-- Recriar função para enviar mensagem de produto cancelado
-- usando formato correto compatível com o endpoint /send do Node.js

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
  v_integration record;
BEGIN
  -- Buscar informações do produto
  SELECT name INTO v_product
  FROM products
  WHERE id = OLD.product_id;
  
  -- Buscar telefone do cliente do carrinho
  SELECT customer_phone INTO v_customer_phone
  FROM carts
  WHERE id = OLD.cart_id;
  
  -- Buscar configuração do WhatsApp para este tenant
  SELECT api_url INTO v_integration
  FROM integration_whatsapp
  WHERE tenant_id = OLD.tenant_id
    AND is_active = true
  LIMIT 1;
  
  -- Usar URL configurada ou fallback para localhost
  v_node_url := COALESCE(v_integration.api_url, 'http://localhost:3333');
  
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
  
  -- Log antes de enviar
  INSERT INTO whatsapp_messages (
    tenant_id,
    phone,
    message,
    type,
    created_at
  ) VALUES (
    OLD.tenant_id,
    v_customer_phone,
    'Tentando enviar PRODUCT_CANCELED para ' || v_customer_phone || ' via ' || v_node_url,
    'system_log',
    now()
  );
  
  -- Enviar mensagem via Node.js usando formato correto
  BEGIN
    SELECT * INTO v_http_response FROM http_post(
      v_node_url || '/send',
      jsonb_build_object(
        'number', v_customer_phone,
        'message', v_message
      )::text,
      'application/json'
    );
    
    -- Log do resultado
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
      'PRODUCT_CANCELED enviado - Status: ' || v_http_response.status || ' - Resposta: ' || COALESCE(v_http_response.content, 'N/A'),
      'system_log',
      now(),
      CASE WHEN v_http_response.status = 200 THEN now() ELSE NULL END
    );
    
    -- Se sucesso, salvar mensagem enviada
    IF v_http_response.status = 200 THEN
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
    END IF;
    
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