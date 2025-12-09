-- Allow authenticated users to read tenants (needed to return representation after insert)
CREATE POLICY IF NOT EXISTS "Authenticated users can select tenants" 
ON public.tenants 
FOR SELECT 
TO authenticated
USING (true);

-- Note: update/delete remain restricted by existing policies.