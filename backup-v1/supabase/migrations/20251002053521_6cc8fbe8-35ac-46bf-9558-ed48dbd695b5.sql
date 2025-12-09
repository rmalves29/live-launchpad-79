-- Corrigir trigger para enviar mensagem de pedido pago
-- A função http_post tem assinatura: http_post(uri, content, content_type)
-- Não aceita headers customizados como quarto parâmetro

CREATE OR REPLACE FUNCTION public.process_paid_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text;
  v_response http_response;
BEGIN
  -- Só processar se o pedido foi marcado como pago agora
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    
    v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
    
    -- Log inicial
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
      'Pedido #' || NEW.id || ' marcado como pago - Chamando edge function',
      'system_log',
      NEW.id,
      now()
    );

    -- Chamar edge function usando http_post simples
    BEGIN
      SELECT * INTO v_response FROM http_post(
        v_supabase_url || '/functions/v1/whatsapp-send-paid-order',
        jsonb_build_object(
          'order_id', NEW.id,
          'tenant_id', NEW.tenant_id
        )::text,
        'application/json'
      );
      
      -- Log do resultado
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
        'Edge function chamada - Status: ' || COALESCE(v_response.status::text, 'NULL') || ' - Resposta: ' || COALESCE(substring(v_response.content, 1, 200), 'N/A'),
        'system_log',
        NEW.id,
        now()
      );
      
    EXCEPTION WHEN OTHERS THEN
      -- Em caso de erro, registrar mas não falhar o update
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
        'ERRO ao chamar edge function: ' || SQLERRM,
        'system_log',
        NEW.id,
        now()
      );
    END;
    
  END IF;
  
  RETURN NEW;
END;
$function$;