-- Cupom da live: aplicar automaticamente + descrição editável na vitrine.
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS auto_apply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text;

-- Mensagens de WhatsApp dos pedidos da Loja da Live (o lojista escolhe quais enviar e o texto de cada uma).
-- Sem linha para um tipo = comportamento padrão da loja (usa o template normal). Só vale para pedidos source = 'live_shop'.
CREATE TABLE IF NOT EXISTS public.live_shop_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_type text NOT NULL CHECK (message_type IN ('ITEM_ADDED', 'PAID_ORDER', 'TRACKING')),
  is_active boolean NOT NULL DEFAULT true,
  content text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, message_type)
);
ALTER TABLE public.live_shop_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant manage live_shop_whatsapp" ON public.live_shop_whatsapp;
CREATE POLICY "Tenant manage live_shop_whatsapp" ON public.live_shop_whatsapp
  FOR ALL TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Service role live_shop_whatsapp" ON public.live_shop_whatsapp;
CREATE POLICY "Service role live_shop_whatsapp" ON public.live_shop_whatsapp
  FOR ALL TO service_role USING (true) WITH CHECK (true);
