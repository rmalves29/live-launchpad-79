
CREATE OR REPLACE FUNCTION public.admin_whatsapp_activity_metrics(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  total_sent bigint,
  avg_gap_seconds numeric,
  disconnect_count bigint,
  avg_msgs_before_disconnect numeric,
  last_msgs_before_disconnect bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT role = 'super_admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  WITH sent AS (
    SELECT m.tenant_id, COALESCE(m.sent_at, m.created_at) AS ts
    FROM whatsapp_messages m
    WHERE m.type::text IN ('outgoing','bulk','item_added')
      AND COALESCE(m.sent_at, m.created_at) >= p_from
      AND COALESCE(m.sent_at, m.created_at) < p_to
  ),
  gaps AS (
    SELECT tenant_id,
      EXTRACT(EPOCH FROM (ts - LAG(ts) OVER (PARTITION BY tenant_id ORDER BY ts))) AS gap_s
    FROM sent
  ),
  gap_agg AS (
    SELECT tenant_id, AVG(gap_s) AS avg_gap
    FROM gaps
    WHERE gap_s IS NOT NULL AND gap_s <= 230*60
    GROUP BY tenant_id
  ),
  sent_agg AS (
    SELECT tenant_id, COUNT(*) AS total_sent FROM sent GROUP BY tenant_id
  ),
  disc AS (
    SELECT l.tenant_id, l.created_at AS ts,
           ROW_NUMBER() OVER (PARTITION BY l.tenant_id ORDER BY l.created_at) AS rn,
           COUNT(*) OVER (PARTITION BY l.tenant_id) AS total_rn
    FROM whatsapp_connection_logs l
    WHERE l.event_type = 'disconnected'
      AND l.created_at >= p_from AND l.created_at < p_to
  ),
  disc_counts AS (
    SELECT d.tenant_id, d.ts, d.rn, d.total_rn,
      (SELECT COUNT(*) FROM sent s
        WHERE s.tenant_id = d.tenant_id
          AND s.ts <= d.ts
          AND s.ts > COALESCE(
            (SELECT MAX(d2.ts) FROM disc d2 WHERE d2.tenant_id = d.tenant_id AND d2.ts < d.ts),
            p_from
          )
      ) AS msgs_before
    FROM disc d
  ),
  disc_agg AS (
    SELECT tenant_id,
      COUNT(*) AS disconnect_count,
      AVG(msgs_before)::numeric AS avg_msgs,
      MAX(CASE WHEN rn = total_rn THEN msgs_before END) AS last_msgs
    FROM disc_counts GROUP BY tenant_id
  )
  SELECT t.id, t.name,
    COALESCE(sa.total_sent, 0),
    ga.avg_gap,
    COALESCE(da.disconnect_count, 0),
    da.avg_msgs,
    da.last_msgs
  FROM tenants t
  LEFT JOIN sent_agg sa ON sa.tenant_id = t.id
  LEFT JOIN gap_agg ga ON ga.tenant_id = t.id
  LEFT JOIN disc_agg da ON da.tenant_id = t.id
  WHERE t.is_active = true
  ORDER BY t.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_whatsapp_activity_metrics(timestamptz, timestamptz) TO authenticated;
