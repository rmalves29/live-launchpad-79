-- Create user profiles table with roles
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user roles enum for better type safety
CREATE TYPE public.user_role AS ENUM ('admin', 'customer');

-- Update profiles table to use the enum
ALTER TABLE public.profiles ALTER COLUMN role TYPE user_role USING role::user_role;

-- Create security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id, 
    NEW.email,
    CASE 
      WHEN NEW.email = 'admin@admin.com' THEN 'admin'::user_role
      ELSE 'customer'::user_role
    END
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add customer_user_id to link customers to auth users (for customer self-service)
ALTER TABLE public.customers ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create updated RLS policies for customers table
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can create customers" ON public.customers;  
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;

-- Admins can see all customers
CREATE POLICY "Admins can manage all customers"
ON public.customers
FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Customers can only see their own data
CREATE POLICY "Customers can view own data"
ON public.customers
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.get_user_role(auth.uid()) = 'admin'
);

-- Allow public insert for checkout process, but link to user if authenticated
CREATE POLICY "Public can create customers"
ON public.customers
FOR INSERT
WITH CHECK (true);

-- Update customers can only be done by admins or the customer themselves
CREATE POLICY "Users can update own customer data"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.get_user_role(auth.uid()) = 'admin'
);

-- Create RLS policies for profiles
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin');

-- Update orders policies to be more specific
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

-- Only admins can manage orders
CREATE POLICY "Admins can manage orders"
ON public.orders
FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Create trigger for updated_at on profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();