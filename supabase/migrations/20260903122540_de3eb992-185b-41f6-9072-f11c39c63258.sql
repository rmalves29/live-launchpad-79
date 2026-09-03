REVOKE EXECUTE ON FUNCTION public.auto_set_order_status_enviado() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_logistics_timestamps() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tr_orders_shipped_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_set_order_status_enviado() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_order_logistics_timestamps() TO service_role;
GRANT EXECUTE ON FUNCTION public.tr_orders_shipped_at() TO service_role;