-- Allow authenticated users to read tenants (needed to return representation after insert)
DROP POLICY IF EXISTS "Authenticated users can select tenants" ON public.tenants;

CREATE POLICY "Authenticated users can select tenants" 
ON public.tenants 
FOR SELECT 
TO authenticated
USING (true);