-- Atualizar função para chamar endpoint específico de produto cancelado
CREATE OR REPLACE FUNCTION public.send_product_canceled_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
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
  
  -- Se não houver configuração, sair silenciosamente
  IF v_integration.api_url IS NULL OR v_integration.api_url = '' THEN
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      created_at
    ) VALUES (
      OLD.tenant_id,
      v_customer_phone,
      'WhatsApp não configurado - mensagem PRODUCT_CANCELED não enviada',
      'system_log',
      now()
    );
    RETURN OLD;
  END IF;
  
  v_node_url := v_integration.api_url;
  
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
  
  -- Enviar via endpoint específico /send-product-canceled do Node.js
  BEGIN
    SELECT * INTO v_http_response FROM http_post(
      v_node_url || '/send-product-canceled',
      jsonb_build_object(
        'phone', v_customer_phone,
        'product_name', v_product.name,
        'product_id', OLD.product_id
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