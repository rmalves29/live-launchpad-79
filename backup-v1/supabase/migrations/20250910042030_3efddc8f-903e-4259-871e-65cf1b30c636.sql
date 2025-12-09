-- Criar policy para permitir acesso público aos tenants ativos (para resolução de subdomínio)
CREATE POLICY "Public can read active tenants"
ON public.tenants
FOR SELECT
TO anon, authenticated
USING (is_active = true);