-- Recriar função para enviar mensagem de produto cancelado usando edge function
CREATE OR REPLACE FUNCTION public.send_product_canceled_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product record;
  v_customer_phone text;
  v_supabase_url text;
  v_response http_response;
BEGIN
  -- Buscar informações do produto
  SELECT name, code INTO v_product
  FROM products
  WHERE id = OLD.product_id;
  
  -- Buscar telefone do cliente do carrinho
  SELECT customer_phone INTO v_customer_phone
  FROM carts
  WHERE id = OLD.cart_id;
  
  -- URL do Supabase
  v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
  
  -- Log inicial
  INSERT INTO whatsapp_messages (
    tenant_id,
    phone,
    message,
    type,
    created_at
  ) VALUES (
    OLD.tenant_id,
    v_customer_phone,
    'Produto ' || v_product.name || ' cancelado - Chamando edge function',
    'system_log',
    now()
  );
  
  -- Chamar edge function usando http_post
  BEGIN
    SELECT * INTO v_response FROM http_post(
      v_supabase_url || '/functions/v1/whatsapp-send-product-canceled',
      jsonb_build_object(
        'cart_item_id', OLD.id,
        'product_id', OLD.product_id,
        'tenant_id', OLD.tenant_id,
        'customer_phone', v_customer_phone
      )::text,
      'application/json'
    );
    
    -- Log do resultado
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      product_name,
      created_at
    ) VALUES (
      OLD.tenant_id,
      v_customer_phone,
      'Edge function chamada - Status: ' || COALESCE(v_response.status::text, 'NULL') || ' - Resposta: ' || COALESCE(substring(v_response.content, 1, 200), 'N/A'),
      'system_log',
      v_product.name,
      now()
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Em caso de erro, registrar mas não falhar o delete
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      product_name,
      created_at
    ) VALUES (
      OLD.tenant_id,
      v_customer_phone,
      'ERRO ao chamar edge function: ' || SQLERRM,
      'system_log',
      v_product.name,
      now()
    );
  END;
  
  RETURN OLD;
END;
$function$;