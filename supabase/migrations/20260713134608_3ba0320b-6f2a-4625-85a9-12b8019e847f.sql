
-- ============================================================
-- FASE 1 — Estabilização P0
-- ============================================================

-- 1) Trigger process_paid_order: síncrono http_post -> assíncrono net.http_post (pg_net)
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
      UPDATE public.orders SET payment_confirmation_sent = false WHERE id = NEW.id;
      RETURN NEW;
    END IF;

    -- Fire-and-forget assíncrono (nunca bloqueia a transação por mais de ~10ms)
    BEGIN
      v_service_key := current_setting('app.settings.service_role_key', true);

      SELECT net.http_post(
        url     := v_supabase_url || '/functions/v1/zapi-send-paid-order',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
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

      -- Otimista: presume dispatch OK; a edge function atualiza payment_confirmation_sent quando de fato entregar
      UPDATE public.orders SET payment_confirmation_sent = true WHERE id = NEW.id;

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO whatsapp_messages (
        tenant_id, phone, message, type, order_id, created_at
      ) VALUES (
        NEW.tenant_id, NEW.customer_phone,
        'ERRO ao enfileirar zapi-send-paid-order (async): ' || SQLERRM,
        'system_log', NEW.id, now()
      );
      UPDATE public.orders SET payment_confirmation_sent = false WHERE id = NEW.id;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Trigger export_paid_order_to_bagy: mesma conversão para async
CREATE OR REPLACE FUNCTION public.export_paid_order_to_bagy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_integration RECORD;
  v_supabase_url text := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
  v_service_key  text;
  v_request_id   bigint;
BEGIN
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    SELECT * INTO v_integration
    FROM public.integration_bagy
    WHERE tenant_id = NEW.tenant_id
      AND is_active = true
      AND sync_orders_out = true;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    BEGIN
      v_service_key := current_setting('app.settings.service_role_key', true);

      SELECT net.http_post(
        url     := v_supabase_url || '/functions/v1/bagy-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
        ),
        body    := jsonb_build_object(
          'tenant_id', NEW.tenant_id,
          'action', 'export_order',
          'order_id', NEW.id
        )
      ) INTO v_request_id;

      RAISE LOG '[bagy-auto-export] Pedido #% enfileirado async - request_id=%', NEW.id, v_request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[bagy-auto-export] Erro pedido #% (async): %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Idempotência de webhooks de pagamento
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS external_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_logs_external_event
  ON public.webhook_logs (webhook_type, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- 4) RLS em tabelas de backup (somente service_role)
ALTER TABLE public.cron_logs_backups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs_backups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_file_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only" ON public.cron_logs_backups;
CREATE POLICY "service role only" ON public.cron_logs_backups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service role only" ON public.webhook_logs_backups;
CREATE POLICY "service role only" ON public.webhook_logs_backups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service role only" ON public.storage_file_references;
CREATE POLICY "service role only" ON public.storage_file_references
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) Push tables: restringir a tenant do usuário (era authenticated true/true)
DROP POLICY IF EXISTS "tenant users manage subs" ON public.push_subscriptions;
CREATE POLICY "tenant users manage subs" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_current_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "tenant users manage campaigns" ON public.push_campaigns;
CREATE POLICY "tenant users manage campaigns" ON public.push_campaigns
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_current_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "tenant users manage templates" ON public.push_templates;
CREATE POLICY "tenant users manage templates" ON public.push_templates
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_current_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "tenant users read log" ON public.push_notifications_log;
CREATE POLICY "tenant users read log" ON public.push_notifications_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "service inserts log" ON public.push_notifications_log;
DROP POLICY IF EXISTS "service updates log" ON public.push_notifications_log;
-- INSERT/UPDATE ficam restritos a service_role via bypass (edge functions usam service key)

-- 6) whatsapp_messages: remover INSERT anônimo (edge functions usam service_role e triggers são SECURITY DEFINER)
DROP POLICY IF EXISTS "External services can insert whatsapp messages" ON public.whatsapp_messages;

-- 7) Índices compostos de performance
CREATE INDEX IF NOT EXISTS idx_orders_tenant_paid_created
  ON public.orders (tenant_id, is_paid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fe_group_events_tenant_created
  ON public.fe_group_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant_created
  ON public.webhook_logs (tenant_id, created_at DESC);
