-- Corrigir o enum whatsapp_message_type para incluir 'bulk' e 'mass'
ALTER TYPE whatsapp_message_type ADD VALUE IF NOT EXISTS 'bulk';
ALTER TYPE whatsapp_message_type ADD VALUE IF NOT EXISTS 'mass';

-- Verificar se existe o trigger que está causando o problema
DROP TRIGGER IF EXISTS add_app_tag_on_bulk_message_trigger ON whatsapp_messages;

-- Recriar o trigger com o tipo correto
CREATE OR REPLACE FUNCTION public.add_app_tag_on_bulk_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app_tag_id BIGINT;
  v_customer_id BIGINT;
  v_http_response record;
  v_supabase_url text;
BEGIN
  -- Só processar se for uma mensagem do tipo bulk/mass/broadcast
  IF NEW.type IN ('bulk', 'mass', 'broadcast') THEN
    
    -- Verificar se existe a tabela customer_tags antes de tentar usar
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_tags') THEN
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
      IF v_customer_id IS NOT NULL AND v_app_tag_id IS NOT NULL AND 
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_tag_assignments') THEN
        INSERT INTO customer_tag_assignments (customer_id, tag_id) 
        VALUES (v_customer_id, v_app_tag_id)
        ON CONFLICT (customer_id, tag_id) DO NOTHING;
      END IF;
    END IF;
    
    -- Chamar edge function para adicionar etiqueta no WhatsApp apenas se a função existir
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
        tenant_id,
        phone,
        message,
        type,
        created_at
      ) VALUES (
        NEW.tenant_id,
        NEW.phone,
        'Tentativa de adicionar etiqueta APP no WhatsApp - Status: ' || v_http_response.status || ' - Resposta: ' || COALESCE(v_http_response.content, 'N/A'),
        'system_log',
        now()
      );
      
    EXCEPTION WHEN OTHERS THEN
      -- Em caso de erro na chamada HTTP, registrar no log mas não falhar o trigger
      INSERT INTO whatsapp_messages (
        tenant_id,
        phone,
        message,
        type,
        created_at
      ) VALUES (
        NEW.tenant_id,
        NEW.phone,
        'Erro ao chamar API para adicionar etiqueta WhatsApp: ' || SQLERRM,
        'system_log',
        now()
      );
    END;
    
    -- Salvar/atualizar registro na tabela MKT_MM apenas se existir
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mkt_mm') THEN
      INSERT INTO mkt_mm (phone, last_message_status, last_sent_at)
      VALUES (NEW.phone, 'sent', NEW.sent_at)
      ON CONFLICT (phone) DO UPDATE SET
        last_message_status = EXCLUDED.last_message_status,
        last_sent_at = EXCLUDED.last_sent_at,
        updated_at = now();
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$function$;