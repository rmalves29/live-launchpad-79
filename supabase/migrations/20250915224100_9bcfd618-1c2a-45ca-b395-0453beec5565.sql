-- Atualizar a função process_paid_order para incluir tenant_id nas chamadas das edge functions
CREATE OR REPLACE FUNCTION public.process_paid_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_envio_id bigint;
  v_http_response record;
  v_supabase_url text;
  v_supabase_key text;
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
      ) RETURNING id INTO v_envio_id;
      
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
        'Pedido #' || NEW.id || ' foi marcado como pago. Processamento automático para Melhor Envio iniciado.',
        'system_log',
        NEW.id,
        now()
      );
      
      -- Chamar edge function para criar shipment no Melhor Envio
      BEGIN
        -- URLs do Supabase
        v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
        
        -- Fazer chamada HTTP para a edge function
        SELECT * INTO v_http_response FROM http_post(
          v_supabase_url || '/functions/v1/melhor-envio-labels',
          jsonb_build_object(
            'action', 'create_shipment',
            'order_id', NEW.id,
            'customer_phone', NEW.customer_phone,
            'tenant_id', NEW.tenant_id
          )::text,
          'application/json'
        );
        
        -- Log da resposta
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
          'Chamada para API Melhor Envio - Status: ' || v_http_response.status || ' - Resposta: ' || COALESCE(v_http_response.content, 'N/A'),
          'system_log',
          NEW.id,
          now()
        );
        
        -- Se a chamada foi bem-sucedida, atualizar status
        IF v_http_response.status = 200 THEN
          UPDATE frete_envios 
          SET 
            status = 'created',
            raw_response = v_http_response.content::jsonb,
            updated_at = now()
          WHERE id = v_envio_id;
        ELSE
          -- Se houve erro, atualizar status
          UPDATE frete_envios 
          SET 
            status = 'error',
            raw_response = jsonb_build_object('error', v_http_response.content),
            updated_at = now()
          WHERE id = v_envio_id;
        END IF;
        
      EXCEPTION WHEN OTHERS THEN
        -- Em caso de erro na chamada HTTP, registrar no log
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
          'Erro ao chamar API Melhor Envio: ' || SQLERRM,
          'system_log',
          NEW.id,
          now()
        );
        
        UPDATE frete_envios 
        SET 
          status = 'error',
          raw_response = jsonb_build_object('error', SQLERRM),
          updated_at = now()
        WHERE id = v_envio_id;
      END;
      
    END IF;

    -- Integração com Bling
    BEGIN
      v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
      
      -- Fazer chamada HTTP para a edge function do Bling
      SELECT * INTO v_http_response FROM http_post(
        v_supabase_url || '/functions/v1/bling-integration',
        jsonb_build_object(
          'action', 'create_order',
          'order_id', NEW.id,
          'customer_phone', NEW.customer_phone,
          'tenant_id', NEW.tenant_id
        )::text,
        'application/json'
      );
      
      -- Log da resposta do Bling
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
        'Chamada para API Bling - Status: ' || v_http_response.status || ' - Resposta: ' || COALESCE(v_http_response.content, 'N/A'),
        'system_log',
        NEW.id,
        now()
      );
      
    EXCEPTION WHEN OTHERS THEN
      -- Em caso de erro na chamada HTTP do Bling, registrar no log mas não falhar o trigger
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
        'Erro ao chamar API Bling: ' || SQLERRM,
        'system_log',
        NEW.id,
        now()
      );
    END;
    
  END IF;
  
  RETURN NEW;
END;
$$;