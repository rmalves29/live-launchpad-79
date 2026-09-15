REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(bigint, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(bigint, integer) TO service_role;