-- Drop função com CASCADE para remover o trigger também
DROP FUNCTION IF EXISTS send_product_canceled_message() CASCADE;

-- Criar função para enviar mensagem de produto cancelado
CREATE OR REPLACE FUNCTION send_product_canceled_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product record;
  v_customer_phone text;
  v_supabase_url text;
  v_response http_response;
BEGIN
  -- Log inicial
  RAISE LOG '🗑️ Trigger iniciado para cart_item_id: %', OLD.id;
  
  -- Buscar informações do produto
  SELECT name, code INTO v_product
  FROM products
  WHERE id = OLD.product_id;
  
  RAISE LOG '📦 Produto: % (%)', v_product.name, v_product.code;
  
  -- Buscar telefone do cliente do carrinho
  SELECT customer_phone INTO v_customer_phone
  FROM carts
  WHERE id = OLD.cart_id;
  
  RAISE LOG '📱 Telefone cliente: %', v_customer_phone;
  
  -- URL do Supabase
  v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
  
  -- Log antes da chamada HTTP
  RAISE LOG '📡 Chamando edge function: %/functions/v1/whatsapp-send-product-canceled', v_supabase_url;
  
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
    RAISE LOG '✅ Resposta HTTP: status=%, content=%', 
      COALESCE(v_response.status::text, 'NULL'), 
      COALESCE(substring(v_response.content, 1, 200), 'N/A');
    
    -- Registrar na tabela whatsapp_messages para tracking
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
      'Edge function chamada - Status: ' || COALESCE(v_response.status::text, 'NULL') || ' - Produto: ' || v_product.name,
      'system_log',
      v_product.name,
      now()
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Em caso de erro, registrar mas não falhar o delete
    RAISE LOG '❌ ERRO ao chamar edge function: %', SQLERRM;
    
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
      'ERRO ao chamar edge function: ' || SQLERRM || ' - Produto: ' || v_product.name,
      'system_log',
      v_product.name,
      now()
    );
  END;
  
  RETURN OLD;
END;
$$;

-- Criar trigger para executar ANTES do DELETE
CREATE TRIGGER trigger_send_product_canceled_message
BEFORE DELETE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION send_product_canceled_message();