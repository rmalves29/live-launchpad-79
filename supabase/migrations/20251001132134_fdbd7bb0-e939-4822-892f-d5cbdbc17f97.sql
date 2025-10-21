-- Remover trigger e função antigos com CASCADE
DROP FUNCTION IF EXISTS public.send_item_added_message() CASCADE;

-- Criar nova função que chama o Node.js
CREATE OR REPLACE FUNCTION public.send_item_added_message_nodejs()
RETURNS TRIGGER AS $$
DECLARE
  v_product record;
  v_customer_phone text;
  v_http_response record;
BEGIN
  -- Buscar informações do produto
  SELECT id, name, code, price INTO v_product
  FROM products
  WHERE id = NEW.product_id;
  
  -- Buscar telefone do cliente do carrinho
  SELECT customer_phone INTO v_customer_phone
  FROM carts
  WHERE id = NEW.cart_id;
  
  -- Enviar mensagem via Node.js (localhost:3333)
  BEGIN
    SELECT * INTO v_http_response FROM http_post(
      'http://localhost:3333/send-item-added',
      jsonb_build_object(
        'phone', v_customer_phone,
        'product_id', v_product.id,
        'quantity', NEW.qty
      )::text,
      'application/json'
    );
    
    -- Log da mensagem enviada (opcional)
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
      'Mensagem de item adicionado enviada via Node.js - Status: ' || v_http_response.status,
      'outgoing',
      now(),
      now()
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Em caso de erro, registrar no log mas não falhar o trigger
    INSERT INTO whatsapp_messages (
      tenant_id,
      phone,
      message,
      type,
      created_at
    ) VALUES (
      NEW.tenant_id,
      v_customer_phone,
      'Erro ao enviar mensagem via Node.js: ' || SQLERRM,
      'system_log',
      now()
    );
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para enviar mensagem quando item é adicionado
CREATE TRIGGER trigger_send_item_added_message_nodejs
AFTER INSERT ON public.cart_items
FOR EACH ROW
EXECUTE FUNCTION public.send_item_added_message_nodejs();