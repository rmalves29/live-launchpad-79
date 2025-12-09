-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trigger_process_paid_order ON orders;

-- Criar ou substituir função atualizada
CREATE OR REPLACE FUNCTION public.process_paid_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text;
BEGIN
  -- Só processar se o pedido foi marcado como pago agora
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    
    v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
    
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
      'Pedido #' || NEW.id || ' marcado como pago - Enviando mensagem de confirmação',
      'system_log',
      NEW.id,
      now()
    );

    -- Chamar edge function de forma assíncrona (não bloqueia o update)
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/whatsapp-send-paid-order',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'token'
      ),
      body := jsonb_build_object(
        'order_id', NEW.id,
        'tenant_id', NEW.tenant_id
      )
    );
    
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Criar trigger
CREATE TRIGGER trigger_process_paid_order
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION process_paid_order();