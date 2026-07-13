
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
          COALESCE(webhook_type, 'desconhecido') AS origem,
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
        SELECT id, webhook_type, status_code, error_message, created_at, retry_count, tenant_id
        FROM public.webhook_logs
        WHERE created_at > now() - interval '24 hours'
          AND (status_code >= 400 OR status_code IS NULL)
        ORDER BY created_at DESC LIMIT 25
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
    'recent_health_alerts', (
      SELECT COALESCE(jsonb_agg(a ORDER BY sent_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, rule_key, severity, title, sent_at
        FROM public.health_alerts_log
        WHERE sent_at > now() - interval '24 hours'
        ORDER BY sent_at DESC LIMIT 20
      ) a
    ),
    'db_total_size', pg_size_pretty(pg_database_size(current_database())),
    'generated_at', now()
  ) INTO v_result;
  RETURN v_result;
END;
$$;
