-- Permitir leitura pública de informações básicas de tenants ativos (para checkout público)
CREATE POLICY "Public can view active tenants basic info"
ON public.tenants
FOR SELECT
USING (is_active = true);