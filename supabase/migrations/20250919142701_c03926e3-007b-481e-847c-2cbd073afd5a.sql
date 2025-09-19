-- Corrigir função process_paid_order removendo referências à tabela frete_envios inexistente
CREATE OR REPLACE FUNCTION public.process_paid_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_http_response record;
  v_supabase_url text;
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

    -- Integração com Bling (mantém apenas essa parte)
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
$function$;