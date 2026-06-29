
-- 1) Tenants config
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS waitlist_reserve_minutes integer NOT NULL DEFAULT 120;

-- 2) Waitlist table
CREATE TABLE IF NOT EXISTS public.product_waitlist (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id integer NOT NULL,
  customer_id bigint,
  customer_phone text NOT NULL,
  customer_name text,
  customer_instagram text,
  qty integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','converted','expired','cancelled')),
  source text NOT NULL DEFAULT 'storefront' CHECK (source IN ('storefront','whatsapp','manual')),
  notified_at timestamptz,
  reserved_until timestamptz,
  order_id bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_waitlist TO authenticated;
GRANT ALL ON public.product_waitlist TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.product_waitlist_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.product_waitlist_id_seq TO service_role;

ALTER TABLE public.product_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select_waitlist" ON public.product_waitlist
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenant_insert_waitlist" ON public.product_waitlist
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenant_update_waitlist" ON public.product_waitlist
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenant_delete_waitlist" ON public.product_waitlist
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_waitlist_tenant_product_status_created
  ON public.product_waitlist (tenant_id, product_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_reserved_until
  ON public.product_waitlist (reserved_until) WHERE status = 'notified';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_waitlist_active_per_customer_product
  ON public.product_waitlist (tenant_id, product_id, customer_phone)
  WHERE status IN ('waiting','notified');

CREATE TRIGGER trg_waitlist_updated_at
  BEFORE UPDATE ON public.product_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Trigger: dispatch process-next when stock rises
CREATE OR REPLACE FUNCTION public.dispatch_waitlist_on_stock_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_waiting boolean;
  v_enabled boolean;
BEGIN
  IF NEW.stock IS NULL OR NEW.stock <= 0 THEN RETURN NEW; END IF;
  IF COALESCE(OLD.stock,0) >= NEW.stock THEN RETURN NEW; END IF;

  SELECT waitlist_enabled INTO v_enabled FROM tenants WHERE id = NEW.tenant_id;
  IF NOT COALESCE(v_enabled, true) THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM product_waitlist
    WHERE tenant_id = NEW.tenant_id AND product_id = NEW.id AND status = 'waiting'
  ) INTO v_has_waiting;
  IF NOT v_has_waiting THEN RETURN NEW; END IF;

  BEGIN
    PERFORM http_post(
      'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/waitlist-process-next',
      jsonb_build_object('tenant_id', NEW.tenant_id, 'product_id', NEW.id)::text,
      'application/json'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[waitlist-dispatch] err: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_waitlist_on_stock_return ON public.products;
CREATE TRIGGER trg_dispatch_waitlist_on_stock_return
  AFTER UPDATE OF stock ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_waitlist_on_stock_return();

-- 4) Default WAITLIST_AVAILABLE template for existing tenants
INSERT INTO public.whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT t.id, 'WAITLIST_AVAILABLE'::whatsapp_template_type, 'Fila de Espera - Produto Disponível',
E'🎉 *Boa notícia!*\n\nO produto *{{produto}}* (cód. {{codigo}}) voltou ao estoque e separamos uma unidade para você!\n\n⏰ Você tem até *{{prazo}}* para finalizar o pagamento.\n💳 Link: {{link}}\n\nCaso não pague no prazo, o produto passa para a próxima cliente da fila.',
now(), now()
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates w
  WHERE w.tenant_id = t.id AND w.type = 'WAITLIST_AVAILABLE'::whatsapp_template_type
);

-- 5) Update default-templates trigger for new tenants
CREATE OR REPLACE FUNCTION public.create_default_whatsapp_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at) VALUES
    (NEW.id, 'ITEM_ADDED', 'Item Adicionado ao Pedido',
      E'🛒 *Item adicionado ao pedido*\n\n✅ {{produto}}\nQtd: *{{quantidade}}*\nValor: *R$ {{valor}}*\n\nDigite *FINALIZAR* para concluir seu pedido.', now(), now()),
    (NEW.id, 'PRODUCT_CANCELED', 'Produto Cancelado',
      E'❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.', now(), now()),
    (NEW.id, 'PAID_ORDER', 'Pedido Pago',
      E'🎉 *Pagamento Confirmado - Pedido #{{order_id}}*\n\n✅ Recebemos seu pagamento!\n💰 Valor: *R$ {{total}}*\n\nSeu pedido está sendo preparado para envio.\n\nObrigado pela preferência! 💚', now(), now()),
    (NEW.id, 'SENDFLOW', 'SendFlow - Divulgação em Grupos',
      E'🛍️ *{{nome}}* ({{codigo}})\n\n🎨 Cor: {{cor}}\n📏 Tamanho: {{tamanho}}\n💰 Valor: {{valor}}\n\n📱 Para comprar, digite apenas o código: *{{codigo}}*', now(), now()),
    (NEW.id, 'MSG_MASSA', 'Mensagem em Massa',
      E'📢 *Comunicado Importante*\n\nOlá! 👋\n\nEsta é uma mensagem em massa para nossos clientes.\n\nFique atento às nossas novidades! 🚀', now(), now()),
    (NEW.id, 'WAITLIST_AVAILABLE', 'Fila de Espera - Produto Disponível',
      E'🎉 *Boa notícia!*\n\nO produto *{{produto}}* (cód. {{codigo}}) voltou ao estoque e separamos uma unidade para você!\n\n⏰ Você tem até *{{prazo}}* para finalizar o pagamento.\n💳 Link: {{link}}\n\nCaso não pague no prazo, o produto passa para a próxima cliente da fila.', now(), now());
  RETURN NEW;
END;
$$;
