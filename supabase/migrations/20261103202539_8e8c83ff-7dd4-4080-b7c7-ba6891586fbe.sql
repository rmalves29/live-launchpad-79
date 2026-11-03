REVOKE EXECUTE ON FUNCTION public.my_platform_affiliate_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_platform_affiliate_id() TO authenticated, service_role;