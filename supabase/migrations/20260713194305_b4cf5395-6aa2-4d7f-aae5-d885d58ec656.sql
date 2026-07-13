-- Allow authenticated users to manage storage_file_references for their tenants,
-- since the trigger runs the INSERT and users editing products need this to succeed
-- even in edge cases where SECURITY DEFINER bypass doesn't apply.

CREATE POLICY "Tenant members manage storage refs"
ON public.storage_file_references
FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
)
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_file_references TO authenticated;