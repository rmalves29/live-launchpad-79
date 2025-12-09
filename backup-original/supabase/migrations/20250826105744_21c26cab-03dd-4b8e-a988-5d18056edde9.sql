-- Corrigir função para incluir search_path como exigido pelas boas práticas de segurança
CREATE OR REPLACE FUNCTION public.process_paid_order()
RETURNS TRIGGER AS $$
DECLARE
  v_config_data record;
  v_customer_data record;
  v_cotacao_data record;
  v_app_settings record;
  v_shipment_payload jsonb;
  v_response_data jsonb;
  v_envio_id bigint;
BEGIN
  -- Só processar se o pedido foi marcado como pago agora
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    
    -- Verificar se já existe um envio para este pedido
    SELECT id INTO v_envio_id 
    FROM frete_envios 
    WHERE pedido_id = NEW.id;
    
    -- Se não existe envio, criar automaticamente
    IF v_envio_id IS NULL THEN
      
      -- Inserir registro inicial no frete_envios
      INSERT INTO frete_envios (
        pedido_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        'auto_pending',
        now(),
        now()
      );
      
      -- Log para monitoramento
      INSERT INTO whatsapp_messages (
        phone,
        message,
        type,
        order_id,
        created_at
      ) VALUES (
        NEW.customer_phone,
        'Pedido #' || NEW.id || ' foi marcado como pago. Processamento automático para Melhor Envio iniciado.',
        'system_log',
        NEW.id,
        now()
      );
      
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';