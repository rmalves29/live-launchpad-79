-- Etapa 5.3 — gatilhos do banco passam a mandar a chave interna (header x-cartzy-internal-key, chave "sistema").
-- Hoje as funções chamadas IGNORAM esse header: nada muda para as lojas. Serve para, depois da Black Friday,
-- travar as funções aceitando só o sistema (service role / chave interna) e o usuário logado da loja.
-- Corpos copiados da produção em 20/11/2026; a única mudança é o header.
-- Fora daqui: dispatch_waitlist_on_stock_return usa http_post da extensão http (sem headers) — fica para a trava;
-- add_app_tag_on_bulk_message precisa de ajuste na própria função whatsapp-add-label (exige login hoje).

insert into private.internal_keys (name, key)
values ('sistema', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- Pedido pago → mensagem de pagamento confirmado
CREATE OR REPLACE FUNCTION public.process_paid_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
  v_service_key  text;
  v_request_id   bigint;
BEGIN
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN

    IF COALESCE(NEW.skip_paid_message, false) THEN
      INSERT INTO whatsapp_messages (
        tenant_id, phone, message, type, order_id, created_at
      ) VALUES (
        NEW.tenant_id, NEW.customer_phone,
        'Envio de confirmação de pagamento ignorado pelo usuário',
        'system_log', NEW.id, now()
      );
      RETURN NEW;
    END IF;

    BEGIN
      v_service_key := current_setting('app.settings.service_role_key', true);

      SELECT net.http_post(
        url     := v_supabase_url || '/functions/v1/zapi-send-paid-order',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(v_service_key, ''),
          'x-cartzy-internal-key', COALESCE(private.internal_key('sistema'), '')
        ),
        body    := jsonb_build_object(
          'order_id', NEW.id,
          'tenant_id', NEW.tenant_id
        )
      ) INTO v_request_id;

      INSERT INTO whatsapp_messages (
        tenant_id, phone, message, type, order_id, created_at
      ) VALUES (
        NEW.tenant_id, NEW.customer_phone,
        'Z-API zapi-send-paid-order enfileirado (async) - request_id: ' || COALESCE(v_request_id::text,'NULL'),
        'system_log', NEW.id, now()
      );

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO whatsapp_messages (
        tenant_id, phone, message, type, order_id, created_at
      ) VALUES (
        NEW.tenant_id, NEW.customer_phone,
        'ERRO ao enfileirar zapi-send-paid-order (async): ' || SQLERRM,
        'system_log', NEW.id, now()
      );
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Rastreio postado → mensagem de rastreio
CREATE OR REPLACE FUNCTION public.send_tracking_whatsapp_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.melhor_envio_tracking_code IS NOT NULL
     AND NEW.melhor_envio_tracking_code <> ''
     AND NEW.tracking_posted IS TRUE
     AND (
       OLD.melhor_envio_tracking_code IS NULL
       OR OLD.melhor_envio_tracking_code = ''
       OR OLD.tracking_posted IS DISTINCT FROM TRUE
     )
  THEN
    PERFORM net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-tracking',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-cartzy-internal-key', COALESCE(private.internal_key('sistema'), '')),
      body := jsonb_build_object(
        'order_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'tracking_code', NEW.melhor_envio_tracking_code,
        'shipped_at', COALESCE(NEW.shipped_at, now())::text
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Aviso da agenda para o Rafael (WhatsApp)
CREATE OR REPLACE FUNCTION public.agenda_whats_rafael(msg text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
begin
  perform net.http_post(
    url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-message',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cartzy-internal-key', COALESCE(private.internal_key('sistema'), '')),
    body := jsonb_build_object('tenant_id', public.agenda_cfg('tenant_aviso_rafael'),
                               'phone', public.agenda_cfg('telefone_rafael'), 'message', msg),
    timeout_milliseconds := 60000);
end $function$;
