
CREATE OR REPLACE FUNCTION public.admin_whatsapp_activity_metrics(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(tenant_id uuid, tenant_name text, total_sent bigint, msgs_per_minute numeric, msgs_per_hour numeric, item_added_count bigint, item_added_per_minute numeric, order_cancelled_count bigint, payment_count bigint, out_of_stock_count bigint, group_msg_count bigint, received_private bigint, avg_gap_seconds numeric, last_gap_seconds numeric, disconnect_count bigint, avg_msgs_before_disconnect numeric, last_msgs_before_disconnect bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT role = 'super_admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  WITH sent AS (
    SELECT
      m.tenant_id AS tid,
      COALESCE(m.sent_at, m.created_at) AS ts,
      m.type::text AS mtype,
      COALESCE(m.phone, '') AS mphone,
      COALESCE(m.message, '') AS mmsg
    FROM whatsapp_messages m
    WHERE m.type::text IN ('outgoing','bulk','mass','broadcast','item_added','individual')
      AND COALESCE(m.sent_at, m.created_at) >= p_from
      AND COALESCE(m.sent_at, m.created_at) < p_to
  ),
  sent_flagged AS (
    SELECT s.*,
      (mtype = 'item_added') AS is_item_added,
      (mmsg ILIKE '%cancelad%' OR mmsg ILIKE '%cancelam%') AS is_cancelled,
      (mmsg ILIKE '%pagamento%' OR mmsg ILIKE '%pago%' OR mmsg ILIKE '%comprovante%' OR mmsg ILIKE '%pix%recebid%') AS is_payment,
      (mmsg ILIKE '%sem estoque%' OR mmsg ILIKE '%esgotad%' OR mmsg ILIKE '%estoque insuficiente%' OR mmsg ILIKE '%sem%disponibilidade%') AS is_out_of_stock,
      (mphone LIKE '%@g.us' OR mphone LIKE '%-group' OR mtype IN ('bulk','mass','broadcast')) AS is_group
    FROM sent s
  ),
  key_msgs AS (
    SELECT tid, ts FROM sent_flagged
    WHERE is_item_added OR is_cancelled OR is_payment OR is_out_of_stock
  ),
  key_gaps AS (
    SELECT tid, ts,
           EXTRACT(EPOCH FROM (ts - LAG(ts) OVER (PARTITION BY tid ORDER BY ts))) AS gap_s
    FROM key_msgs
  ),
  gap_agg AS (
    SELECT tid, AVG(gap_s) AS avg_gap
    FROM key_gaps
    WHERE gap_s IS NOT NULL AND gap_s <= 230*60
    GROUP BY tid
  ),
  last_gap_agg AS (
    SELECT DISTINCT ON (tid) tid, gap_s AS last_gap
    FROM key_gaps
    WHERE gap_s IS NOT NULL
    ORDER BY tid, ts DESC
  ),
  -- Pico item_added por minuto
  item_per_minute AS (
    SELECT tid, date_trunc('minute', ts) AS bucket, COUNT(*) AS c
    FROM sent_flagged WHERE is_item_added
    GROUP BY tid, date_trunc('minute', ts)
  ),
  item_peak_agg AS (
    SELECT tid, MAX(c) AS peak_item_min FROM item_per_minute GROUP BY tid
  ),
  per_minute AS (
    SELECT tid, date_trunc('minute', ts) AS bucket, COUNT(*) AS c
    FROM sent_flagged GROUP BY tid, date_trunc('minute', ts)
  ),
  per_minute_agg AS (
    SELECT tid, MAX(c) AS peak_min FROM per_minute GROUP BY tid
  ),
  per_hour AS (
    SELECT tid, date_trunc('hour', ts) AS bucket, COUNT(*) AS c
    FROM sent_flagged GROUP BY tid, date_trunc('hour', ts)
  ),
  per_hour_agg AS (
    SELECT tid, MAX(c) AS peak_hour FROM per_hour GROUP BY tid
  ),
  sent_agg AS (
    SELECT
      tid,
      COUNT(*) AS total_sent,
      COUNT(*) FILTER (WHERE is_item_added) AS item_added_count,
      COUNT(*) FILTER (WHERE is_cancelled) AS order_cancelled_count,
      COUNT(*) FILTER (WHERE is_payment) AS payment_count,
      COUNT(*) FILTER (WHERE is_out_of_stock) AS out_of_stock_count,
      COUNT(*) FILTER (WHERE is_group) AS group_msg_count,
      COUNT(*) FILTER (WHERE NOT is_group) AS private_sent
    FROM sent_flagged GROUP BY tid
  ),
  disc AS (
    SELECT l.tenant_id AS tid, l.created_at AS ts,
           ROW_NUMBER() OVER (PARTITION BY l.tenant_id ORDER BY l.created_at) AS rn,
           COUNT(*) OVER (PARTITION BY l.tenant_id) AS total_rn
    FROM whatsapp_connection_logs l
    WHERE l.event_type = 'disconnected'
      AND l.created_at >= p_from AND l.created_at < p_to
  ),
  disc_counts AS (
    SELECT d.tid, d.ts, d.rn, d.total_rn,
      (SELECT COUNT(*) FROM sent_flagged s
        WHERE s.tid = d.tid
          AND s.ts <= d.ts
          AND s.ts > COALESCE(
            (SELECT MAX(d2.ts) FROM disc d2 WHERE d2.tid = d.tid AND d2.ts < d.ts),
            p_from
          )
      ) AS msgs_before
    FROM disc d
  ),
  disc_agg AS (
    SELECT tid,
      COUNT(*) AS disconnect_count,
      AVG(msgs_before)::numeric AS avg_msgs,
      MAX(CASE WHEN rn = total_rn THEN msgs_before END) AS last_msgs
    FROM disc_counts GROUP BY tid
  )
  SELECT t.id, t.name,
    COALESCE(sa.total_sent, 0),
    COALESCE(pma.peak_min, 0)::numeric AS msgs_per_minute,
    COALESCE(pha.peak_hour, 0)::numeric AS msgs_per_hour,
    COALESCE(sa.item_added_count, 0),
    COALESCE(ipa.peak_item_min, 0)::numeric AS item_added_per_minute,
    COALESCE(sa.order_cancelled_count, 0),
    COALESCE(sa.payment_count, 0),
    COALESCE(sa.out_of_stock_count, 0),
    COALESCE(sa.group_msg_count, 0),
    COALESCE(sa.private_sent, 0) AS received_private,
    ga.avg_gap,
    lga.last_gap,
    COALESCE(da.disconnect_count, 0),
    da.avg_msgs,
    da.last_msgs
  FROM tenants t
  LEFT JOIN sent_agg sa ON sa.tid = t.id
  LEFT JOIN gap_agg ga ON ga.tid = t.id
  LEFT JOIN last_gap_agg lga ON lga.tid = t.id
  LEFT JOIN item_peak_agg ipa ON ipa.tid = t.id
  LEFT JOIN per_minute_agg pma ON pma.tid = t.id
  LEFT JOIN per_hour_agg pha ON pha.tid = t.id
  LEFT JOIN disc_agg da ON da.tid = t.id
  WHERE t.is_active = true
  ORDER BY t.name;
END;
$function$;
