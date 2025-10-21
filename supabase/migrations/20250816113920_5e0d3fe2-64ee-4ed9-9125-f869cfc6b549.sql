-- Fix RLS policies for orders table to allow unauthenticated users to create orders
-- This is needed for manual orders without authentication

-- Remove the restrictive RLS policy that requires authentication
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders" ON public.orders;

-- Create more permissive policies that allow public access for order management
CREATE POLICY "Allow all operations on orders" 
ON public.orders 
FOR ALL 
USING (true)
WITH CHECK (true);