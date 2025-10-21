-- First, drop the existing insecure policies
DROP POLICY IF EXISTS "Public can create customers" ON public.customers;
DROP POLICY IF EXISTS "Public can view customers" ON public.customers;
DROP POLICY IF EXISTS "Public can update customers" ON public.customers;
DROP POLICY IF EXISTS "Public can delete customers" ON public.customers;

-- Create secure RLS policies for customers table
-- 1. Allow authenticated users to view only their own customer data
CREATE POLICY "Users can view own customer data" 
ON public.customers 
FOR SELECT 
USING (auth.uid() = user_id);

-- 2. Allow admins to view all customer data
CREATE POLICY "Admins can view all customers" 
ON public.customers 
FOR SELECT 
USING (get_user_role(auth.uid()) = 'admin');

-- 3. Allow authenticated users to update only their own customer data
CREATE POLICY "Users can update own customer data" 
ON public.customers 
FOR UPDATE 
USING (auth.uid() = user_id);

-- 4. Allow admins to update all customer data
CREATE POLICY "Admins can update all customers" 
ON public.customers 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'admin');

-- 5. Allow anyone to create customer records (needed for checkout process)
-- But ensure user_id is set correctly if user is authenticated
CREATE POLICY "Anyone can create customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (
  -- If user is authenticated, user_id must match auth.uid()
  -- If user is anonymous, user_id can be null
  (auth.uid() IS NULL AND user_id IS NULL) OR
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

-- 6. Allow admins to create customer records for any user
CREATE POLICY "Admins can create customers for anyone" 
ON public.customers 
FOR INSERT 
WITH CHECK (get_user_role(auth.uid()) = 'admin');

-- 7. Only allow admins to delete customer records
CREATE POLICY "Only admins can delete customers" 
ON public.customers 
FOR DELETE 
USING (get_user_role(auth.uid()) = 'admin');