CREATE POLICY "affiliate payouts super admin" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'affiliate-payouts' AND public.is_super_admin())
WITH CHECK (bucket_id = 'affiliate-payouts' AND public.is_super_admin());
CREATE POLICY "affiliate payouts own read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'affiliate-payouts' AND (storage.foldername(name))[1] = public.my_platform_affiliate_id()::text);