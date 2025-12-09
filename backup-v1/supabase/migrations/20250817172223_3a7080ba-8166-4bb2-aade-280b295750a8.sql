-- Remove RLS policies from app_settings table to allow updates without authentication
DROP POLICY IF EXISTS "Users can view app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Users can update app settings" ON public.app_settings;

-- Create new policies that allow all operations without authentication
CREATE POLICY "Allow all operations on app settings" 
ON public.app_settings 
FOR ALL 
USING (true) 
WITH CHECK (true);