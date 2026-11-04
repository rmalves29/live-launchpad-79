REVOKE ALL ON FUNCTION public.platform_affiliate_record_commission(uuid,text,numeric,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_affiliate_record_commission(uuid,text,numeric,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.platform_affiliate_attach_tenant(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_affiliate_attach_tenant(uuid,uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_affiliate_lookup_lead(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_affiliate_lookup_lead(text,text) TO authenticated, service_role;