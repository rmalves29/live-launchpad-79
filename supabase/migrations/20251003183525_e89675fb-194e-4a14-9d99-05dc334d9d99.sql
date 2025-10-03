-- Create security definer function to check if user is tenant admin
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT role IN ('tenant_admin', 'super_admin')
        FROM profiles 
        WHERE id = auth.uid()
    );
END;
$$;

-- Drop existing permissive policies on customers table
DROP POLICY IF EXISTS "Tenant users can manage their customers" ON public.customers;

-- Create restrictive policies for customers table
-- Only tenant admins and super admins can view customer data
CREATE POLICY "Admins can view customers in their tenant"
ON public.customers
FOR SELECT
USING (
    is_super_admin() OR 
    (is_tenant_admin() AND tenant_id = get_current_tenant_id())
);

-- Only tenant admins and super admins can insert customer data
CREATE POLICY "Admins can insert customers in their tenant"
ON public.customers
FOR INSERT
WITH CHECK (
    is_super_admin() OR 
    (is_tenant_admin() AND tenant_id = get_current_tenant_id())
);

-- Only tenant admins and super admins can update customer data
CREATE POLICY "Admins can update customers in their tenant"
ON public.customers
FOR UPDATE
USING (
    is_super_admin() OR 
    (is_tenant_admin() AND tenant_id = get_current_tenant_id())
)
WITH CHECK (
    is_super_admin() OR 
    (is_tenant_admin() AND tenant_id = get_current_tenant_id())
);

-- Only tenant admins and super admins can delete customer data
CREATE POLICY "Admins can delete customers in their tenant"
ON public.customers
FOR DELETE
USING (
    is_super_admin() OR 
    (is_tenant_admin() AND tenant_id = get_current_tenant_id())
);

COMMENT ON FUNCTION public.is_tenant_admin() IS 'Security definer function to check if current user is a tenant admin or super admin';
COMMENT ON POLICY "Admins can view customers in their tenant" ON public.customers IS 'Restricts customer PII access to tenant admins and super admins only';
COMMENT ON POLICY "Admins can insert customers in their tenant" ON public.customers IS 'Only admins can create customer records';
COMMENT ON POLICY "Admins can update customers in their tenant" ON public.customers IS 'Only admins can modify customer data';
COMMENT ON POLICY "Admins can delete customers in their tenant" ON public.customers IS 'Only admins can delete customer records';