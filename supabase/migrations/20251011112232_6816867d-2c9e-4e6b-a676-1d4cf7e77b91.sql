-- Criar função que envia WhatsApp quando item é adicionado ao carrinho
CREATE OR REPLACE FUNCTION send_whatsapp_on_item_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_cart RECORD;
  v_order RECORD;
  v_supabase_url TEXT;
  v_response http_response;
BEGIN
  -- Buscar URL do Supabase
  v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
  
  -- Buscar informações do produto
  SELECT id, name, code, price 
  INTO v_product
  FROM products 
  WHERE id = NEW.product_id;
  
  IF NOT FOUND THEN
    RAISE LOG 'Produto não encontrado: %', NEW.product_id;
    RETURN NEW;
  END IF;
  
  -- Buscar informações do carrinho
  SELECT customer_phone, tenant_id
  INTO v_cart
  FROM carts
  WHERE id = NEW.cart_id;
  
  IF NOT FOUND THEN
    RAISE LOG 'Carrinho não encontrado: %', NEW.cart_id;
    RETURN NEW;
  END IF;
  
  -- Log para debug
  RAISE LOG 'Enviando WhatsApp - Produto: %, Telefone: %, Tenant: %', 
    v_product.code, v_cart.customer_phone, v_cart.tenant_id;
  
  -- Chamar edge function para enviar WhatsApp
  BEGIN
    SELECT * INTO v_response FROM http_post(
      v_supabase_url || '/functions/v1/whatsapp-send-item-added',
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
    
    -- Log da resposta
    RAISE LOG 'WhatsApp Edge Function - Status: %, Response: %', 
      v_response.status, 
      COALESCE(substring(v_response.content, 1, 200), 'N/A');
      
  EXCEPTION WHEN OTHERS THEN
    -- Em caso de erro, registrar mas não falhar a inserção
    RAISE LOG 'Erro ao chamar edge function WhatsApp: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$;

-- Criar trigger para detectar inserções em cart_items
DROP TRIGGER IF EXISTS trigger_send_whatsapp_on_item_added ON cart_items;
CREATE TRIGGER trigger_send_whatsapp_on_item_added
  AFTER INSERT ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION send_whatsapp_on_item_added();

-- Comentário explicativo
COMMENT ON FUNCTION send_whatsapp_on_item_added() IS 
  'Envia mensagem WhatsApp automaticamente quando um item é adicionado ao carrinho';
COMMENT ON TRIGGER trigger_send_whatsapp_on_item_added ON cart_items IS 
  'Trigger que chama a função para enviar WhatsApp quando item é adicionado';