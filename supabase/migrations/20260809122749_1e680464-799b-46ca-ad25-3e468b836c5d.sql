CREATE OR REPLACE FUNCTION public.admin_global_report(p_from timestamptz, p_to timestamptz, p_tenant_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id uuid;
    v_orders json;
    v_daily json;
BEGIN
    -- Se p_tenant_id não for passado, tenta pegar do contexto se disponível (ou assume o primeiro tenant para este exemplo, mas o ideal é vir via parâmetro)
    v_tenant_id := p_tenant_id;

    -- Métricas Consolidadas
    SELECT json_build_object(
        'total_value', COALESCE(SUM(total_amount), 0),
        'paid_value', COALESCE(SUM(CASE WHEN is_paid = true THEN total_amount ELSE 0 END), 0),
        'pending_value', COALESCE(SUM(CASE WHEN is_paid = false THEN total_amount ELSE 0 END), 0),
        'count', COUNT(*),
        'count_paid', COUNT(*) FILTER (WHERE is_paid = true),
        'count_pending', COUNT(*) FILTER (WHERE is_paid = false),
        'total_products', COALESCE((
            SELECT SUM(ci.qty) 
            FROM cart_items ci 
            JOIN orders o2 ON ci.cart_id = o2.cart_id 
            WHERE o2.tenant_id = v_tenant_id 
              AND o2.created_at >= p_from AND o2.created_at <= p_to
              AND (o2.is_cancelled IS NULL OR o2.is_cancelled = false)
        ), 0),
        'paid_products', COALESCE((
            SELECT SUM(ci.qty) 
            FROM cart_items ci 
            JOIN orders o2 ON ci.cart_id = o2.cart_id 
            WHERE o2.tenant_id = v_tenant_id 
              AND o2.created_at >= p_from AND o2.created_at <= p_to
              AND o2.is_paid = true
              AND (o2.is_cancelled IS NULL OR o2.is_cancelled = false)
        ), 0),
        'pending_products', COALESCE((
            SELECT SUM(ci.qty) 
            FROM cart_items ci 
            JOIN orders o2 ON ci.cart_id = o2.cart_id 
            WHERE o2.tenant_id = v_tenant_id 
              AND o2.created_at >= p_from AND o2.created_at <= p_to
              AND o2.is_paid = false
              AND (o2.is_cancelled IS NULL OR o2.is_cancelled = false)
        ), 0),
        'ticket_medio', CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_amount), 0) / COUNT(*) ELSE 0 END,
        'paid_avg_ticket', CASE WHEN COUNT(*) FILTER (WHERE is_paid = true) > 0 THEN COALESCE(SUM(CASE WHEN is_paid = true THEN total_amount ELSE 0 END), 0) / COUNT(*) FILTER (WHERE is_paid = true) ELSE 0 END,
        'pending_avg_ticket', CASE WHEN COUNT(*) FILTER (WHERE is_paid = false) > 0 THEN COALESCE(SUM(CASE WHEN is_paid = false THEN total_amount ELSE 0 END), 0) / COUNT(*) FILTER (WHERE is_paid = false) ELSE 0 END,
        'avg_shipping_time_hours', AVG(EXTRACT(EPOCH FROM (shipped_at - paid_at))/3600) FILTER (WHERE paid_at IS NOT NULL AND shipped_at IS NOT NULL)
    ) INTO v_orders
    FROM orders
    WHERE tenant_id = v_tenant_id
      AND created_at >= p_from AND created_at <= p_to
      AND (is_cancelled IS NULL OR is_cancelled = false);

    -- Métricas Diárias
    SELECT json_agg(t) INTO v_daily
    FROM (
        SELECT 
            date_trunc('day', created_at AT TIME ZONE 'UTC-3')::date as day,
            SUM(total_amount) as total_value,
            SUM(CASE WHEN is_paid = true THEN total_amount ELSE 0 END) as paid_value,
            SUM(CASE WHEN is_paid = false THEN total_amount ELSE 0 END) as pending_value,
            COUNT(*) as orders_count,
            (
                SELECT SUM(ci.qty) 
                FROM cart_items ci 
                JOIN orders o2 ON ci.cart_id = o2.cart_id 
                WHERE o2.tenant_id = v_tenant_id 
                  AND date_trunc('day', o2.created_at AT TIME ZONE 'UTC-3')::date = date_trunc('day', orders.created_at AT TIME ZONE 'UTC-3')::date
                  AND (o2.is_cancelled IS NULL OR o2.is_cancelled = false)
            ) as products_count
        FROM orders
        WHERE tenant_id = v_tenant_id
          AND created_at >= p_from AND created_at <= p_to
          AND (is_cancelled IS NULL OR is_cancelled = false)
        GROUP BY 1
        ORDER BY 1
    ) t;

    RETURN json_build_object(
        'orders', v_orders,
        'daily_metrics', COALESCE(v_daily, '[]'::json)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_global_report(timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_report(timestamptz, timestamptz, uuid) TO service_role;