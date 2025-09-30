-- Migration 2: Criar funções e templates padrão

-- Função para criar templates padrão quando um tenant é criado
CREATE OR REPLACE FUNCTION public.create_default_whatsapp_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Template: Item Adicionado
  INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
  VALUES (
    NEW.id,
    'ITEM_ADDED',
    'Item Adicionado ao Pedido',
    E'🛒 *Item adicionado ao pedido*\n\n✅ {{produto}}\nQtd: *{{quantidade}}*\nValor: *R$ {{valor}}*\n\nDigite *FINALIZAR* para concluir seu pedido.',
    now(),
    now()
  );

  -- Template: Produto Cancelado
  INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
  VALUES (
    NEW.id,
    'PRODUCT_CANCELED',
    'Produto Cancelado',
    E'❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.',
    now(),
    now()
  );

  -- Template: Pedido Pago
  INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
  VALUES (
    NEW.id,
    'PAID_ORDER',
    'Pedido Pago',
    E'🎉 *Pagamento Confirmado - Pedido #{{order_id}}*\n\n✅ Recebemos seu pagamento!\n💰 Valor: *R$ {{total}}*\n\nSeu pedido está sendo preparado para envio.\n\nObrigado pela preferência! 💚',
    now(),
    now()
  );

  -- Template: SendFlow (mensagens de grupo)
  INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
  VALUES (
    NEW.id,
    'SENDFLOW',
    'SendFlow - Divulgação em Grupos',
    E'🛍️ *{{nome}}* ({{codigo}})\n\n🎨 Cor: {{cor}}\n📏 Tamanho: {{tamanho}}\n💰 Valor: {{valor}}\n\n📱 Para comprar, digite apenas o código: *{{codigo}}*',
    now(),
    now()
  );

  -- Template: Mensagem em Massa
  INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
  VALUES (
    NEW.id,
    'MSG_MASSA',
    'Mensagem em Massa',
    E'📢 *Comunicado Importante*\n\nOlá! 👋\n\nEsta é uma mensagem em massa para nossos clientes.\n\nFique atento às nossas novidades! 🚀',
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

-- Criar trigger para criar templates padrão em novos tenants
DROP TRIGGER IF EXISTS trigger_create_default_whatsapp_templates ON tenants;
CREATE TRIGGER trigger_create_default_whatsapp_templates
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION create_default_whatsapp_templates();

-- Atualizar a função process_paid_order para usar o template PAID_ORDER
CREATE OR REPLACE FUNCTION public.process_paid_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_http_response record;
  v_supabase_url text;
  v_shipping_integration record;
  v_template record;
  v_message text;
BEGIN
  -- Só processar se o pedido foi marcado como pago agora
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    
    -- Buscar template de pedido pago
    SELECT * INTO v_template 
    FROM whatsapp_templates 
    WHERE tenant_id = NEW.tenant_id 
      AND type = 'PAID_ORDER'
    LIMIT 1;
    
    -- Construir mensagem
    IF v_template IS NOT NULL THEN
      v_message := v_template.content;
      v_message := replace(v_message, '{{order_id}}', NEW.id::text);
      v_message := replace(v_message, '{{total}}', to_char(NEW.total_amount, 'FM999999990.00'));
      v_message := replace(v_message, '{{customer_name}}', COALESCE(NEW.customer_name, 'Cliente'));
    ELSE
      -- Fallback se não houver template
      v_message := '🎉 *Pagamento Confirmado - Pedido #' || NEW.id || '*' || E'\n\n' ||
                   '✅ Recebemos seu pagamento!' || E'\n' ||
                   '💰 Valor: *R$ ' || to_char(NEW.total_amount, 'FM999999990.00') || '*' || E'\n\n' ||
                   'Seu pedido está sendo preparado para envio.' || E'\n\n' ||
                   'Obrigado pela preferência! 💚';
    END IF;
    
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
    END IF;
    
    -- Enviar mensagem de confirmação de pagamento via WhatsApp
    BEGIN
      v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
      
      SELECT * INTO v_http_response FROM http_post(
        v_supabase_url || '/functions/v1/whatsapp-send-template',
        jsonb_build_object(
          'tenant_id', NEW.tenant_id,
          'phone', NEW.customer_phone,
          'message', v_message
        )::text,
        'application/json'
      );
      
      -- Log do envio da mensagem
      INSERT INTO whatsapp_messages (
        tenant_id,
        phone,
        message,
        type,
        order_id,
        created_at,
        sent_at
      ) VALUES (
        NEW.tenant_id,
        NEW.customer_phone,
        v_message,
        'outgoing',
        NEW.id,
        now(),
        now()
      );
      
    EXCEPTION WHEN OTHERS THEN
      -- Em caso de erro no envio da mensagem, registrar no log
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
        'Erro ao enviar mensagem de pagamento: ' || SQLERRM,
        'system_log',
        NEW.id,
        now()
      );
    END;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recriar trigger para garantir que está ativo
DROP TRIGGER IF EXISTS trigger_process_paid_order ON orders;
CREATE TRIGGER trigger_process_paid_order
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL))
  EXECUTE FUNCTION process_paid_order();

-- Criar templates padrão para tenants existentes que não têm templates
INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  t.id,
  'ITEM_ADDED',
  'Item Adicionado ao Pedido',
  E'🛒 *Item adicionado ao pedido*\n\n✅ {{produto}}\nQtd: *{{quantidade}}*\nValor: *R$ {{valor}}*\n\nDigite *FINALIZAR* para concluir seu pedido.',
  now(),
  now()
FROM tenants t
WHERE t.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_templates wt 
    WHERE wt.tenant_id = t.id AND wt.type = 'ITEM_ADDED'
  );

INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  t.id,
  'PRODUCT_CANCELED',
  'Produto Cancelado',
  E'❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.',
  now(),
  now()
FROM tenants t
WHERE t.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_templates wt 
    WHERE wt.tenant_id = t.id AND wt.type = 'PRODUCT_CANCELED'
  );

INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  t.id,
  'PAID_ORDER',
  'Pedido Pago',
  E'🎉 *Pagamento Confirmado - Pedido #{{order_id}}*\n\n✅ Recebemos seu pagamento!\n💰 Valor: *R$ {{total}}*\n\nSeu pedido está sendo preparado para envio.\n\nObrigado pela preferência! 💚',
  now(),
  now()
FROM tenants t
WHERE t.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_templates wt 
    WHERE wt.tenant_id = t.id AND wt.type = 'PAID_ORDER'
  );

INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  t.id,
  'SENDFLOW',
  'SendFlow - Divulgação em Grupos',
  E'🛍️ *{{nome}}* ({{codigo}})\n\n🎨 Cor: {{cor}}\n📏 Tamanho: {{tamanho}}\n💰 Valor: {{valor}}\n\n📱 Para comprar, digite apenas o código: *{{codigo}}*',
  now(),
  now()
FROM tenants t
WHERE t.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_templates wt 
    WHERE wt.tenant_id = t.id AND wt.type = 'SENDFLOW'
  );

INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  t.id,
  'MSG_MASSA',
  'Mensagem em Massa',
  E'📢 *Comunicado Importante*\n\nOlá! 👋\n\nEsta é uma mensagem em massa para nossos clientes.\n\nFique atento às nossas novidades! 🚀',
  now(),
  now()
FROM tenants t
WHERE t.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_templates wt 
    WHERE wt.tenant_id = t.id AND wt.type = 'MSG_MASSA'
  );