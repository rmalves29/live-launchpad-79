-- Remover integração Bling da função process_paid_order
CREATE OR REPLACE FUNCTION public.process_paid_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_http_response record;
  v_supabase_url text;
  v_shipping_integration record;
BEGIN
  -- Só processar se o pedido foi marcado como pago agora
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    
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
      'Pedido #' || NEW.id || ' foi marcado como pago.',
      'system_log',
      NEW.id,
      now()
    );

    -- Verificar se existe integração ativa do Melhor Envio para este tenant
    SELECT * INTO v_shipping_integration 
    FROM shipping_integrations 
    WHERE tenant_id = NEW.tenant_id 
      AND provider = 'melhor_envio' 
      AND is_active = true 
      AND access_token IS NOT NULL;

    -- Se existe integração ativa, criar remessa no Melhor Envio
    IF FOUND THEN
      BEGIN
        v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
        
        -- Criar remessa no Melhor Envio
        SELECT * INTO v_http_response FROM http_post(
          v_supabase_url || '/functions/v1/melhor-envio-labels',
          jsonb_build_object(
            'action', 'create_shipment',
            'order_id', NEW.id,
            'tenant_id', NEW.tenant_id
          )::text,
          'application/json'
        );
        
        -- Log da criação da remessa
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
          'Criação de remessa ME - Status: ' || v_http_response.status || ' - Resposta: ' || COALESCE(v_http_response.content, 'N/A'),
          'system_log',
          NEW.id,
          now()
        );
        
      EXCEPTION WHEN OTHERS THEN
        -- Em caso de erro na integração ME, registrar no log mas não falhar o trigger
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
    ELSE
      -- Log indicando que não há integração ativa
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
        'Integração Melhor Envio não configurada ou inativa para este tenant',
        'system_log',
        NEW.id,
        now()
      );
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$function$;