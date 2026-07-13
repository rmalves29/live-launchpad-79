
-- Bloco 2
CREATE TABLE IF NOT EXISTS public.health_alerts_log (
  id BIGSERIAL PRIMARY KEY,
  rule_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warn',
  title TEXT NOT NULL,
  detail JSONB,
  sent_to TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_alerts_rule_time
  ON public.health_alerts_log (rule_key, sent_at DESC);

GRANT SELECT ON public.health_alerts_log TO authenticated;
GRANT ALL ON public.health_alerts_log TO service_role;
ALTER TABLE public.health_alerts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_health_alerts"
  ON public.health_alerts_log FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- Bloco 4
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- Bloco 1: snapshot
CREATE OR REPLACE FUNCTION public.get_health_snapshot()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_admin boolean; v_result jsonb;
BEGIN
  SELECT role = 'super_admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT jsonb_build_object(
    'webhooks_24h', (
      SELECT COALESCE(jsonb_agg(w ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(NULLIF(split_part(regexp_replace(endpoint,'^/functions/v1/',''),'/',1),''),'desconhecido') AS origem,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status_code >= 400 OR status_code IS NULL) AS erros,
          ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 400 OR status_code IS NULL) / NULLIF(COUNT(*),0), 1) AS pct_erro
        FROM public.webhook_logs
        WHERE created_at > now() - interval '24 hours'
        GROUP BY 1
      ) w
    ),
    'webhooks_recent_errors', (
      SELECT COALESCE(jsonb_agg(e ORDER BY created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, endpoint, status_code, created_at, retry_count
        FROM public.webhook_logs
        WHERE created_at > now() - interval '24 hours'
          AND (status_code >= 400 OR status_code IS NULL)
        ORDER BY created_at DESC LIMIT 15
      ) e
    ),
    'stuck_jobs', jsonb_build_object(
      'sending_jobs_running_gt_10min', (SELECT COUNT(*) FROM public.sending_jobs WHERE status = 'running' AND updated_at < now() - interval '10 minutes'),
      'sendflow_pending_gt_30min', (SELECT COUNT(*) FROM public.sendflow_tasks WHERE status IN ('pending','queued') AND created_at < now() - interval '30 minutes'),
      'push_campaigns_incomplete_gt_1h', (SELECT COUNT(*) FROM public.push_campaigns WHERE status IN ('queued','running','sending') AND created_at < now() - interval '1 hour')
    ),
    'whatsapp_sessions', (
      SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) FROM (
        SELECT status, COUNT(*) AS total FROM public.whatsapp_active_sessions GROUP BY status
      ) s
    ),
    'top_tables', (
      SELECT COALESCE(jsonb_agg(t ORDER BY total_bytes DESC), '[]'::jsonb)
      FROM (
        SELECT relname AS table_name,
               pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
               pg_total_relation_size(relid) AS total_bytes,
               n_live_tup AS row_count,
               n_dead_tup AS dead_rows
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC LIMIT 10
      ) t
    ),
    'db_total_size', pg_size_pretty(pg_database_size(current_database())),
    'generated_at', now()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stuck_jobs()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_admin boolean; v_result jsonb;
BEGIN
  SELECT role = 'super_admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT jsonb_build_object(
    'sending_jobs', (
      SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) FROM (
        SELECT id, tenant_id, status, created_at, updated_at
        FROM public.sending_jobs
        WHERE status = 'running' AND updated_at < now() - interval '10 minutes'
        ORDER BY updated_at ASC LIMIT 30
      ) j
    ),
    'sendflow_tasks', (
      SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) FROM (
        SELECT id, tenant_id, status, created_at
        FROM public.sendflow_tasks
        WHERE status IN ('pending','queued') AND created_at < now() - interval '30 minutes'
        ORDER BY created_at ASC LIMIT 30
      ) j
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Bloco 3: cache wrappers
CREATE OR REPLACE FUNCTION public.get_admin_metrics_cached(p_ttl_seconds INT DEFAULT 300)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean; v_cached jsonb; v_result jsonb;
  v_global_tenant uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT role = 'super_admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_cached := public.cached_report_get(v_global_tenant, 'admin_metrics', '');
  IF v_cached IS NOT NULL THEN RETURN v_cached || jsonb_build_object('_from_cache', true); END IF;
  v_result := public.get_admin_metrics();
  PERFORM public.cached_report_set(v_global_tenant, 'admin_metrics', v_result, p_ttl_seconds, '');
  RETURN v_result || jsonb_build_object('_from_cache', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_whatsapp_activity_metrics_cached(
  p_from timestamptz, p_to timestamptz, p_ttl_seconds INT DEFAULT 600
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean; v_hash text; v_cached jsonb; v_result jsonb;
  v_global_tenant uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT role = 'super_admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_hash := md5(p_from::text || '|' || p_to::text);
  v_cached := public.cached_report_get(v_global_tenant, 'wa_activity', v_hash);
  IF v_cached IS NOT NULL THEN RETURN v_cached || jsonb_build_object('_from_cache', true); END IF;
  SELECT jsonb_build_object('rows', COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)) INTO v_result
  FROM public.admin_whatsapp_activity_metrics(p_from, p_to) x;
  PERFORM public.cached_report_set(v_global_tenant, 'wa_activity', v_result, p_ttl_seconds, v_hash);
  RETURN v_result || jsonb_build_object('_from_cache', false);
END;
$$;

-- Crons
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cached-report-cleanup') THEN
    PERFORM cron.schedule('cached-report-cleanup', '0 * * * *',
      $CRON$ SELECT public.cached_report_cleanup(); $CRON$);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'system-health-check') THEN
    PERFORM cron.schedule('system-health-check', '*/15 * * * *',
      $CRON$
      SELECT net.http_post(
        url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/system-health-check',
        headers := jsonb_build_object('Content-Type','application/json'),
        body := jsonb_build_object('trigger','cron')
      );
      $CRON$);
  END IF;
END $$;

-- app_settings: adiciona coluna do telefone de alerta
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS health_alert_phone TEXT;
