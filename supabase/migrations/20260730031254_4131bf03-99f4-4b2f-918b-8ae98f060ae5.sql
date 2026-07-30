CREATE INDEX IF NOT EXISTS idx_orders_created_at_global ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at_global ON public.whatsapp_messages (created_at);

CREATE OR REPLACE FUNCTION public.admin_global_report(p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ok boolean; r jsonb;
BEGIN
  SELECT role = 'super_admin' INTO v_ok FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_ok,false) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT jsonb_build_object(
    'orders', (SELECT jsonb_build_object(
        'total_value', COALESCE(SUM(total_amount),0),
        'paid_value',  COALESCE(SUM(total_amount) FILTER (WHERE is_paid),0),
        'pending_value',COALESCE(SUM(total_amount) FILTER (WHERE NOT COALESCE(is_paid,false)),0),
        'count',       COUNT(*),
        'count_paid',  COUNT(*) FILTER (WHERE is_paid),
        'count_pending',COUNT(*) FILTER (WHERE NOT COALESCE(is_paid,false)),
        'ticket_medio',ROUND(COALESCE(AVG(total_amount),0)::numeric,2))
      FROM orders
      WHERE COALESCE(is_cancelled,false)=false
        AND created_at >= p_from AND created_at < p_to),
    'messages', (SELECT jsonb_build_object(
        'total',   COUNT(*),
        'grupos',  COUNT(*) FILTER (WHERE phone LIKE '%@g.us' OR type IN ('bulk','mass','broadcast')),
        'privado', COUNT(*) FILTER (WHERE phone NOT LIKE '%@g.us' AND type NOT IN ('bulk','mass','broadcast')))
      FROM whatsapp_messages
      WHERE type IN ('outgoing','bulk','mass','broadcast','item_added','individual')
        AND created_at >= p_from
        AND created_at < p_to)
  ) INTO r;
  RETURN r;
END; $function$;