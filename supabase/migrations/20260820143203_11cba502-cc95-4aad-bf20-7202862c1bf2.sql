-- Add missing message metrics to admin_global_report
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
            AVG(EXTRACT(EPOCH FROM (shipped_at - paid_at)) / 3600) FILTER (WHERE shipped_at IS NOT NULL AND paid_at IS NOT NULL) as avg_shipping_hours
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
            COUNT(o.id) as orders_count,
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
            COUNT(*) FILTER (WHERE target_jid LIKE '%@g.us') as grupos,
            COUNT(*) FILTER (WHERE target_jid NOT LIKE '%@g.us') as privado
        FROM public.sending_jobs
        WHERE (v_is_super_admin OR tenant_id = v_tenant_id) 
          AND created_at BETWEEN p_from AND p_to
          AND status = 'sent'
    )
    SELECT json_build_object(
        'orders', (SELECT json_build_object(
            'count', count, 'count_paid', count_paid, 'count_pending', count - count_paid,
            'total_value', COALESCE(total_value, 0), 'paid_value', COALESCE(paid_value, 0), 'pending_value', COALESCE(total_value, 0) - COALESCE(paid_value, 0),
            'total_products', (SELECT total_products FROM products_stats),
            'ticket_medio', CASE WHEN count > 0 THEN total_value / count ELSE 0 END,
            'avg_shipping_time_hours', ROUND(COALESCE(avg_shipping_hours, 0)::numeric, 1)
        ) FROM orders_stats),
        'daily_metrics', (SELECT json_agg(json_build_object('day', day, 'orders_count', orders_count, 'products_count', products_count)) FROM daily_stats),
        'messages', (SELECT json_build_object(
            'total', total,
            'grupos', grupos,
            'privado', privado
        ) FROM messages_stats)
    ) INTO v_res;
    RETURN v_res;
END;
$function$;