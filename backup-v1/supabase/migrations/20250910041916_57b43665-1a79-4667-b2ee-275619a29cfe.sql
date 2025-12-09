-- Allow public (anon) to read active tenants for subdomain resolution
-- This enables the app to resolve a tenant by slug on public subdomains without requiring auth
CREATE POLICY IF NOT EXISTS "Public can select active tenants"
ON public.tenants
FOR SELECT
USING (is_active = true);