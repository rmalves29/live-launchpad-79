CREATE OR REPLACE FUNCTION public.admin_global_report(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_is_super_admin boolean;
    v_tenant_id uuid;
    v_res json;
BEGIN
    -- Check if super_admin
    v_is_super_admin := public.is_super_admin();
    v_tenant_id := (select auth.jwt() ->> 'tenant_id')::uuid;

    WITH orders_stats AS (
        SELECT 
            COUNT(*) as count,
            COUNT(*) FILTER (WHERE is_paid = true) as count_paid,
            SUM(total_amount) as total_value,
            SUM(total_amount) FILTER (WHERE is_paid = true) as paid_value,
            AVG(EXTRACT(EPOCH FROM (shipped_at - paid_at)) / 86400.0) FILTER (WHERE shipped_at IS NOT NULL AND paid_at IS NOT NULL) as avg_shipping_days
        FROM public.orders
        WHERE (v_is_super_admin OR tenant_id = v_tenant_id) 
          AND created_at BETWEEN p_from AND p_to 
          AND (is_cancelled IS FALSE OR is_cancelled IS NULL)
    ),
    products_stats AS (
        SELECT COALESCE(SUM(ci.qty), 0) as total_products
        FROM public.orders o JOIN public.cart_items ci ON ci.cart_id = o.cart_id
        WHERE (v_is_super_admin OR o.tenant_id = v_tenant_id) 
          AND o.created_at BETWEEN p_from AND p_to 
          AND (o.is_cancelled IS FALSE OR o.is_cancelled IS NULL)
    ),
    daily_stats AS (
        SELECT 
            date_trunc('day', o.created_at AT TIME ZONE 'UTC-3') as day,
            COUNT(DISTINCT o.id) as orders_count,
            COALESCE(SUM(ci.qty), 0) as products_count
        FROM public.orders o LEFT JOIN public.cart_items ci ON ci.cart_id = o.cart_id
        WHERE (v_is_super_admin OR o.tenant_id = v_tenant_id) 
          AND o.created_at BETWEEN p_from AND p_to 
          AND (o.is_cancelled IS FALSE OR o.is_cancelled IS NULL)
        GROUP BY 1 ORDER BY 1 ASC
    ),
    messages_stats AS (
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE phone LIKE '%@g.us' OR group_name IS NOT NULL OR whatsapp_group_name IS NOT NULL) as grupos,
            COUNT(*) FILTER (WHERE NOT (phone LIKE '%@g.us' OR group_name IS NOT NULL OR whatsapp_group_name IS NOT NULL)) as privado
        FROM public.whatsapp_messages
        WHERE (v_is_super_admin OR tenant_id = v_tenant_id) 
          AND created_at BETWEEN p_from AND p_to
          AND (delivery_status != 'FAILED' OR delivery_status IS NULL)
    ),
    customers_stats AS (
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE phone IN (SELECT customer_phone FROM public.orders WHERE is_paid = true)) as com_pedido_pago,
            COUNT(*) FILTER (WHERE phone NOT IN (SELECT customer_phone FROM public.orders WHERE is_paid = true)) as sem_pedido_pago
        FROM public.customers
        WHERE (v_is_super_admin OR tenant_id = v_tenant_id)
    )
    SELECT json_build_object(
        'orders', (SELECT json_build_object(
            'count', count, 'count_paid', count_paid, 'count_pending', count - count_paid,
            'total_value', COALESCE(total_value, 0), 'paid_value', COALESCE(paid_value, 0), 'pending_value', COALESCE(total_value, 0) - COALESCE(paid_value, 0),
            'total_products', (SELECT total_products FROM products_stats),
            'ticket_medio', CASE WHEN count > 0 THEN total_value / count ELSE 0 END,
            'avg_shipping_time_days', ROUND(COALESCE(avg_shipping_days, 0)::numeric, 2)
        ) FROM orders_stats),
        'daily_metrics', (SELECT json_agg(json_build_object('date', day, 'orders_count', orders_count, 'products_count', products_count)) FROM daily_stats),
        'messages', (SELECT json_build_object(
            'total', total,
            'grupos', grupos,
            'privado', privado
        ) FROM messages_stats),
        'customers', (SELECT json_build_object(
            'total', total,
            'com_pedido_pago', com_pedido_pago,
            'sem_pedido_pago', sem_pedido_pago
        ) FROM customers_stats)
    ) INTO v_res;
    RETURN v_res;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_global_report(timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_report(timestamp with time zone, timestamp with time zone) TO service_role;
