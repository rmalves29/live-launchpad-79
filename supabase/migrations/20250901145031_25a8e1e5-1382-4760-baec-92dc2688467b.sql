-- Remove existing restrictive policies
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;
DROP POLICY IF EXISTS "Users can view own customer data" ON public.customers;
DROP POLICY IF EXISTS "Users can update own customer data" ON public.customers;
DROP POLICY IF EXISTS "Admins can update all customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can create customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can create customers for anyone" ON public.customers;
DROP POLICY IF EXISTS "Only admins can delete customers" ON public.customers;

-- Create new permissive policies for customer management
CREATE POLICY "Public can view all customers" 
ON public.customers 
FOR SELECT 
USING (true);

CREATE POLICY "Public can create customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can update customers" 
ON public.customers 
FOR UPDATE 
USING (true);

CREATE POLICY "Public can delete customers" 
ON public.customers 
FOR DELETE 
USING (true);