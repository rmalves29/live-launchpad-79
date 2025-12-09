-- Trigger para enviar mensagem de produto adicionado automaticamente
CREATE OR REPLACE FUNCTION send_item_added_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template record;
  v_message text;
  v_product record;
  v_customer_phone text;
  v_http_response record;
  v_supabase_url text;
BEGIN
  -- Buscar informações do produto
  SELECT name, price INTO v_product
  FROM products
  WHERE id = NEW.product_id;
  
  -- Buscar telefone do cliente do carrinho
  SELECT customer_phone INTO v_customer_phone
  FROM carts
  WHERE id = NEW.cart_id;
  
  -- Buscar template ITEM_ADDED
  SELECT * INTO v_template 
  FROM whatsapp_templates 
  WHERE tenant_id = NEW.tenant_id 
    AND type = 'ITEM_ADDED'
  LIMIT 1;
  
  -- Construir mensagem
  IF v_template IS NOT NULL THEN
    v_message := v_template.content;
    v_message := replace(v_message, '{{produto}}', v_product.name);
    v_message := replace(v_message, '{{quantidade}}', NEW.qty::text);
    v_message := replace(v_message, '{{valor}}', to_char(NEW.unit_price, 'FM999999990.00'));
  ELSE
    -- Fallback se não houver template
    v_message := '🛒 *Item adicionado ao pedido*' || E'\n\n' ||
                 '✅ ' || v_product.name || E'\n' ||
                 'Qtd: *' || NEW.qty || '*' || E'\n' ||
                 'Valor: *R$ ' || to_char(NEW.unit_price, 'FM999999990.00') || '*' || E'\n\n' ||
                 'Digite *FINALIZAR* para concluir seu pedido.';
  END IF;
  
  -- Enviar mensagem via edge function
  BEGIN
    v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
    
    SELECT * INTO v_http_response FROM http_post(
      v_supabase_url || '/functions/v1/whatsapp-send-template',
      jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'phone', v_customer_phone,
        'message', v_message
      )::text,
      'application/json'
    );
    
    -- Log da mensagem enviada
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      created_at,
      sent_at
    ) VALUES (
      NEW.tenant_id,
      v_customer_phone,
      v_message,
      'outgoing',
      now(),
      now()
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Em caso de erro, registrar no log
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      created_at
    ) VALUES (
      NEW.tenant_id,
      v_customer_phone,
      'Erro ao enviar mensagem ITEM_ADDED: ' || SQLERRM,
      'system_log',
      now()
    );
  END;
  
  RETURN NEW;
END;
$$;

-- Criar trigger para cart_items INSERT
DROP TRIGGER IF EXISTS trigger_send_item_added ON cart_items;
CREATE TRIGGER trigger_send_item_added
AFTER INSERT ON cart_items
FOR EACH ROW
EXECUTE FUNCTION send_item_added_message();

-- Trigger para enviar mensagem de produto cancelado
CREATE OR REPLACE FUNCTION send_product_canceled_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template record;
  v_message text;
  v_product record;
  v_customer_phone text;
  v_http_response record;
  v_supabase_url text;
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
    -- Fallback se não houver template
    v_message := '❌ *Produto Cancelado*' || E'\n\n' ||
                 'O produto "' || v_product.name || '" foi cancelado do seu pedido.' || E'\n\n' ||
                 'Qualquer dúvida, entre em contato conosco.';
  END IF;
  
  -- Enviar mensagem via edge function
  BEGIN
    v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
    
    SELECT * INTO v_http_response FROM http_post(
      v_supabase_url || '/functions/v1/whatsapp-send-template',
      jsonb_build_object(
        'tenant_id', OLD.tenant_id,
        'phone', v_customer_phone,
        'message', v_message
      )::text,
      'application/json'
    );
    
    -- Log da mensagem enviada
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
    -- Em caso de erro, registrar no log
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      created_at
    ) VALUES (
      OLD.tenant_id,
      v_customer_phone,
      'Erro ao enviar mensagem PRODUCT_CANCELED: ' || SQLERRM,
      'system_log',
      now()
    );
  END;
  
  RETURN OLD;
END;
$$;

-- Criar trigger para cart_items DELETE
DROP TRIGGER IF EXISTS trigger_send_product_canceled ON cart_items;
CREATE TRIGGER trigger_send_product_canceled
AFTER DELETE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION send_product_canceled_message();

-- Atualizar trigger de pedido pago para garantir envio automático
DROP TRIGGER IF EXISTS trigger_process_paid_order ON orders;
CREATE TRIGGER trigger_process_paid_order
AFTER UPDATE OF is_paid ON orders
FOR EACH ROW
WHEN (NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL))
EXECUTE FUNCTION process_paid_order();