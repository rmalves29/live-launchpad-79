
-- FASE 4 — A: Índices para queries frequentes sem cobertura ideal
CREATE INDEX IF NOT EXISTS idx_orders_tenant_customer_phone
  ON public.orders (tenant_id, customer_phone);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_created
  ON public.customers (tenant_id, created_at DESC);

-- Índice parcial para listagem de pedidos ativos (filtro comum: is_cancelled não verdadeiro)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_active
  ON public.orders (tenant_id, created_at DESC)
  WHERE (is_cancelled IS NULL OR is_cancelled = false);

-- FASE 4 — A: Remove UPDATE recursivo dentro do trigger process_paid_order
-- (o UPDATE fazia com que todos os triggers AFTER/BEFORE UPDATE de orders reprocessassem,
-- resultando em UPDATE de ~5s). A edge function zapi-send-paid-order é a autoridade final
-- de payment_confirmation_sent, então o "otimismo" intermediário era desnecessário.
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

-- FASE 4 — D: Infraestrutura de cache de relatórios
CREATE TABLE IF NOT EXISTS public.report_cache (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_key TEXT NOT NULL,
  params_hash TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, report_key, params_hash)
);

CREATE INDEX IF NOT EXISTS idx_report_cache_expires
  ON public.report_cache (expires_at);

GRANT SELECT ON public.report_cache TO authenticated;
GRANT ALL ON public.report_cache TO service_role;

ALTER TABLE public.report_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_users_read_report_cache"
  ON public.report_cache FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());

-- Helpers para uso em edge functions e triggers
CREATE OR REPLACE FUNCTION public.cached_report_get(
  p_tenant_id UUID, p_report_key TEXT, p_params_hash TEXT DEFAULT ''
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT payload FROM public.report_cache
  WHERE tenant_id = p_tenant_id
    AND report_key = p_report_key
    AND params_hash = p_params_hash
    AND expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cached_report_set(
  p_tenant_id UUID, p_report_key TEXT, p_payload JSONB,
  p_ttl_seconds INT DEFAULT 300, p_params_hash TEXT DEFAULT ''
) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.report_cache (tenant_id, report_key, params_hash, payload, computed_at, expires_at)
  VALUES (p_tenant_id, p_report_key, p_params_hash, p_payload, now(), now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (tenant_id, report_key, params_hash)
  DO UPDATE SET payload = EXCLUDED.payload,
                computed_at = EXCLUDED.computed_at,
                expires_at = EXCLUDED.expires_at;
$$;

-- Limpeza periódica de cache expirado (rodar via cron)
CREATE OR REPLACE FUNCTION public.cached_report_cleanup()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM public.report_cache WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
