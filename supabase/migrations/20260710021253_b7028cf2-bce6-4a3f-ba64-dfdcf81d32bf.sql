
-- Enum para tipos de template
DO $$ BEGIN
  CREATE TYPE public.push_template_type AS ENUM (
    'cart_item_added','cart_item_removed','order_paid','tracking_code','waitlist'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.push_channel AS ENUM ('push','whatsapp_fallback');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.push_campaign_audience AS ENUM ('all','paid','unpaid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ push_subscriptions ============
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id BIGINT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NULL,
  name TEXT NULL,
  phone TEXT NULL,
  instagram_handle TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subs_tenant ON public.push_subscriptions(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_push_subs_phone ON public.push_subscriptions(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_push_subs_customer ON public.push_subscriptions(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.push_subscriptions_id_seq TO authenticated, service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant users manage subs" ON public.push_subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ push_templates ============
CREATE TABLE IF NOT EXISTS public.push_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  type public.push_template_type NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT NULL,
  click_url TEXT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_templates TO authenticated;
GRANT ALL ON public.push_templates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.push_templates_id_seq TO authenticated, service_role;

ALTER TABLE public.push_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant users manage templates" ON public.push_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ push_campaigns ============
CREATE TABLE IF NOT EXISTS public.push_campaigns (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT NULL,
  click_url TEXT NULL,
  audience public.push_campaign_audience NOT NULL DEFAULT 'all',
  total_targets INT NOT NULL DEFAULT 0,
  total_sent INT NOT NULL DEFAULT 0,
  total_failed INT NOT NULL DEFAULT 0,
  total_clicked INT NOT NULL DEFAULT 0,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_camp_tenant ON public.push_campaigns(tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_campaigns TO authenticated;
GRANT ALL ON public.push_campaigns TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.push_campaigns_id_seq TO authenticated, service_role;

ALTER TABLE public.push_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant users manage campaigns" ON public.push_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ push_notifications_log ============
CREATE TABLE IF NOT EXISTS public.push_notifications_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  subscription_id BIGINT NULL,
  customer_id BIGINT NULL,
  template_type public.push_template_type NULL,
  campaign_id BIGINT NULL,
  title TEXT NULL,
  body TEXT NULL,
  channel public.push_channel NOT NULL DEFAULT 'push',
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clicked_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_push_log_tenant ON public.push_notifications_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_log_campaign ON public.push_notifications_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_log_template ON public.push_notifications_log(tenant_id, template_type, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_notifications_log TO authenticated;
GRANT ALL ON public.push_notifications_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.push_notifications_log_id_seq TO authenticated, service_role;

ALTER TABLE public.push_notifications_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant users read log" ON public.push_notifications_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service inserts log" ON public.push_notifications_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "service updates log" ON public.push_notifications_log
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============ trigger updated_at ============
CREATE OR REPLACE FUNCTION public.push_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_push_templates_touch ON public.push_templates;
CREATE TRIGGER trg_push_templates_touch BEFORE UPDATE ON public.push_templates
  FOR EACH ROW EXECUTE FUNCTION public.push_touch_updated_at();

-- ============ seed templates para novos tenants ============
CREATE OR REPLACE FUNCTION public.push_seed_templates_for_tenant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.push_templates (tenant_id, type, title, body, is_enabled) VALUES
    (NEW.id, 'cart_item_added', 'Produto adicionado! 🛒', 'Olá {nome}, adicionamos "{produto}" ao seu carrinho.', false),
    (NEW.id, 'cart_item_removed', 'Produto removido', 'O produto "{produto}" foi removido do seu carrinho.', false),
    (NEW.id, 'order_paid', 'Pagamento confirmado! ✅', 'Seu pedido #{pedido_numero} foi pago com sucesso.', false),
    (NEW.id, 'tracking_code', 'Seu pedido saiu para entrega 📦', 'Rastreio: {codigo_rastreio}', false),
    (NEW.id, 'waitlist', 'Produto disponível! 🎉', 'O produto "{produto}" que você aguardava voltou ao estoque.', false)
  ON CONFLICT (tenant_id, type) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_push_seed_templates ON public.tenants;
CREATE TRIGGER trg_push_seed_templates AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.push_seed_templates_for_tenant();

-- Backfill: cria templates padrão para tenants existentes
INSERT INTO public.push_templates (tenant_id, type, title, body, is_enabled)
SELECT t.id, tp.type, tp.title, tp.body, false
FROM public.tenants t
CROSS JOIN (VALUES
  ('cart_item_added'::public.push_template_type, 'Produto adicionado! 🛒', 'Olá {nome}, adicionamos "{produto}" ao seu carrinho.'),
  ('cart_item_removed'::public.push_template_type, 'Produto removido', 'O produto "{produto}" foi removido do seu carrinho.'),
  ('order_paid'::public.push_template_type, 'Pagamento confirmado! ✅', 'Seu pedido #{pedido_numero} foi pago com sucesso.'),
  ('tracking_code'::public.push_template_type, 'Seu pedido saiu para entrega 📦', 'Rastreio: {codigo_rastreio}'),
  ('waitlist'::public.push_template_type, 'Produto disponível! 🎉', 'O produto "{produto}" que você aguardava voltou ao estoque.')
) AS tp(type, title, body)
ON CONFLICT (tenant_id, type) DO NOTHING;
