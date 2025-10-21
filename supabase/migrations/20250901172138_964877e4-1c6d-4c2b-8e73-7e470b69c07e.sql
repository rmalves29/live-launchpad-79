-- Atualizar função para adicionar etiqueta APP quando mensagem em massa for enviada
-- Agora também chama a API do WhatsApp para adicionar etiqueta
CREATE OR REPLACE FUNCTION public.add_app_tag_on_bulk_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_app_tag_id BIGINT;
  v_customer_id BIGINT;
  v_http_response record;
  v_supabase_url text;
BEGIN
  -- Só processar se for uma mensagem do tipo bulk/mass
  IF NEW.type = 'bulk' OR NEW.type = 'mass' OR NEW.type = 'broadcast' THEN
    
    -- Buscar ID da etiqueta APP
    SELECT id INTO v_app_tag_id 
    FROM customer_tags 
    WHERE name = 'APP';
    
    -- Se a etiqueta APP não existir, criar
    IF v_app_tag_id IS NULL THEN
      INSERT INTO customer_tags (name, color) 
      VALUES ('APP', '#10B981') 
      RETURNING id INTO v_app_tag_id;
    END IF;
    
    -- Buscar ID do cliente pelo telefone
    SELECT id INTO v_customer_id 
    FROM customers 
    WHERE phone = NEW.phone;
    
    -- Se encontrou o cliente, adicionar a etiqueta APP no sistema
    IF v_customer_id IS NOT NULL AND v_app_tag_id IS NOT NULL THEN
      INSERT INTO customer_tag_assignments (customer_id, tag_id) 
      VALUES (v_customer_id, v_app_tag_id)
      ON CONFLICT (customer_id, tag_id) DO NOTHING;
    END IF;
    
    -- Chamar edge function para adicionar etiqueta no WhatsApp
    BEGIN
      v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
      
      SELECT * INTO v_http_response FROM http_post(
        v_supabase_url || '/functions/v1/whatsapp-add-label',
        jsonb_build_object(
          'phone', NEW.phone,
          'label', 'APP'
        )::text,
        'application/json'
      );
      
      -- Log da resposta (opcional, para monitoramento)
      INSERT INTO whatsapp_messages (
        phone,
        message,
        type,
        created_at
      ) VALUES (
        NEW.phone,
        'Tentativa de adicionar etiqueta APP no WhatsApp - Status: ' || v_http_response.status || ' - Resposta: ' || COALESCE(v_http_response.content, 'N/A'),
        'system_log',
        now()
      );
      
    EXCEPTION WHEN OTHERS THEN
      -- Em caso de erro na chamada HTTP, registrar no log mas não falhar o trigger
      INSERT INTO whatsapp_messages (
        phone,
        message,
        type,
        created_at
      ) VALUES (
        NEW.phone,
        'Erro ao chamar API para adicionar etiqueta WhatsApp: ' || SQLERRM,
        'system_log',
        now()
      );
    END;
    
  END IF;
  
  RETURN NEW;
END;
$$;