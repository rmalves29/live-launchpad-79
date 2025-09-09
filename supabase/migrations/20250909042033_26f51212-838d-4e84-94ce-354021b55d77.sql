-- Simplify and guarantee INSERT permission for authenticated users on tenants
DROP POLICY IF EXISTS "Authenticated users can create tenants" ON public.tenants;

CREATE POLICY "Authenticated users can insert tenants" 
ON public.tenants 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Ensure super admins can SELECT/UPDATE/DELETE all tenants explicitly
DROP POLICY IF EXISTS "Super admin can manage all tenants" ON public.tenants;

CREATE POLICY "Super admin can select all tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Super admin can update all tenants"
ON public.tenants
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete all tenants"
ON public.tenants
FOR DELETE
TO authenticated
USING (is_super_admin());

-- Keep users viewing/updating only their own tenant
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Users can update their own tenant" ON public.tenants;

CREATE POLICY "Users can view their own tenant" 
ON public.tenants 
FOR SELECT 
TO authenticated
USING (id = get_current_tenant_id());

CREATE POLICY "Users can update their own tenant" 
ON public.tenants 
FOR UPDATE 
TO authenticated
USING (id = get_current_tenant_id())
WITH CHECK (id = get_current_tenant_id());