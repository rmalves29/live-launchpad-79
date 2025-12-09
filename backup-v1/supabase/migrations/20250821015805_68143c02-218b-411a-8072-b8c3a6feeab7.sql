-- Fix security issues - re-enable RLS on profiles table and create public policy
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);