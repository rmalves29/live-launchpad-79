-- Corrigir as políticas RLS para integração

-- Ajustar as políticas para usar auth.uid() como tenant_id diretamente

-- integration_whatsapp
DROP POLICY IF EXISTS "Super admin can manage all whatsapp integrations" ON public.integration_whatsapp;
DROP POLICY IF EXISTS "Tenant users can manage their whatsapp integrations" ON public.integration_whatsapp;

CREATE POLICY "Users can manage their own WhatsApp integration"
  ON public.integration_whatsapp
  FOR ALL
  USING (auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = tenant_id);

-- payment_integrations
DROP POLICY IF EXISTS "Super admin can manage all payment integrations" ON public.payment_integrations;
DROP POLICY IF EXISTS "Tenant users can manage their payment integrations" ON public.payment_integrations;

CREATE POLICY "Users can manage their own payment integration"
  ON public.payment_integrations
  FOR ALL
  USING (auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = tenant_id);

-- shipping_integrations
DROP POLICY IF EXISTS "Super admin can manage all shipping integrations" ON public.shipping_integrations;
DROP POLICY IF EXISTS "Tenant users can manage their shipping integrations" ON public.shipping_integrations;

CREATE POLICY "Users can manage their own shipping integration"
  ON public.shipping_integrations
  FOR ALL
  USING (auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = tenant_id);

-- bling_integrations
DROP POLICY IF EXISTS "Super admin can manage all bling integrations" ON public.bling_integrations;
DROP POLICY IF EXISTS "Tenant users can manage their bling integrations" ON public.bling_integrations;

CREATE POLICY "Users can manage their own bling integration"
  ON public.bling_integrations
  FOR ALL
  USING (auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = tenant_id);