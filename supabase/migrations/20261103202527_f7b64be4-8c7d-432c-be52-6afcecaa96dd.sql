ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'affiliate';

CREATE TABLE public.platform_affiliate_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_percent numeric NOT NULL DEFAULT 20,
  default_months int,
  attribution_days int NOT NULL DEFAULT 60,
  hold_days int NOT NULL DEFAULT 30,
  min_payout numeric NOT NULL DEFAULT 50,
  affiliate_whatsapp text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_affiliate_settings (id) VALUES (1);
GRANT SELECT, UPDATE ON public.platform_affiliate_settings TO authenticated;
GRANT ALL ON public.platform_affiliate_settings TO service_role;
ALTER TABLE public.platform_affiliate_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pas super admin" ON public.platform_affiliate_settings FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.platform_affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  telefone text,
  pix_key text,
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9]{2,30}$'),
  commission_percent numeric NOT NULL DEFAULT 20 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  commission_months int CHECK (commission_months IS NULL OR commission_months > 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','bloqueado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_affiliates TO authenticated;
GRANT ALL ON public.platform_affiliates TO service_role;
ALTER TABLE public.platform_affiliates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_platform_affiliate_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT id FROM public.platform_affiliates WHERE user_id = auth.uid() LIMIT 1 $$;

CREATE POLICY "pa super admin" ON public.platform_affiliates FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "pa own read" ON public.platform_affiliates FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER platform_affiliates_touch BEFORE UPDATE ON public.platform_affiliates
FOR EACH ROW EXECUTE FUNCTION public.push_touch_updated_at();

CREATE TABLE public.platform_affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.platform_affiliates(id) ON DELETE CASCADE,
  landing_path text, utm_source text, utm_medium text, utm_campaign text, referrer text,
  ip_hash text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.platform_affiliate_clicks (affiliate_id, created_at);

CREATE TABLE public.platform_affiliate_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid REFERENCES public.platform_affiliates(id) ON DELETE SET NULL,
  nome text, whatsapp text, instagram text,
  origem text NOT NULL DEFAULT 'landing' CHECK (origem IN ('landing','manual')),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.platform_affiliate_leads (affiliate_id, created_at);
CREATE INDEX ON public.platform_affiliate_leads (whatsapp);

CREATE TABLE public.platform_affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.platform_affiliates(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  payment_ref text NOT NULL UNIQUE,
  valor_base numeric NOT NULL,
  percent numeric NOT NULL,
  valor_comissao numeric NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','liberada','paga','cancelada')),
  libera_em timestamptz NOT NULL,
  paga_em timestamptz,
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.platform_affiliate_commissions (affiliate_id, status);

CREATE TABLE public.platform_affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.platform_affiliates(id) ON DELETE CASCADE,
  valor numeric NOT NULL,
  pix_key text,
  comprovante_url text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['platform_affiliate_clicks','platform_affiliate_leads','platform_affiliate_commissions','platform_affiliate_payouts'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "super admin all" ON public.%I FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())', t);
    EXECUTE format('CREATE POLICY "affiliate own read" ON public.%I FOR SELECT TO authenticated USING (affiliate_id = public.my_platform_affiliate_id())', t);
  END LOOP;
END $$;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.platform_affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affiliate_attributed_at timestamptz;
ALTER TABLE public.tenant_onboarding_requests ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.platform_affiliates(id) ON DELETE SET NULL;

-- Liga empresa ao afiliado (first-click: não sobrescreve atribuição existente)
CREATE OR REPLACE FUNCTION public.platform_affiliate_attach_tenant(_tenant_id uuid, _affiliate_id uuid, _phone text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text := regexp_replace(coalesce(_phone,''), '\D', '', 'g'); days int;
BEGIN
  IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _affiliate_id IS NULL THEN RETURN false; END IF;
  UPDATE tenants SET affiliate_id = _affiliate_id, affiliate_attributed_at = now()
   WHERE id = _tenant_id AND affiliate_id IS NULL;
  SELECT attribution_days INTO days FROM platform_affiliate_settings WHERE id = 1;
  IF length(p) >= 10 THEN
    UPDATE platform_affiliate_leads SET tenant_id = _tenant_id
     WHERE affiliate_id = _affiliate_id AND tenant_id IS NULL
       AND right(regexp_replace(coalesce(whatsapp,''), '\D', '', 'g'), 8) = right(p, 8)
       AND created_at >= now() - make_interval(days => coalesce(days,60));
  END IF;
  RETURN true;
END $$;

-- Sugere afiliado pelo WhatsApp (primeiro lead dentro da janela)
CREATE OR REPLACE FUNCTION public.platform_affiliate_match_lead(_phone text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p text := regexp_replace(coalesce(_phone,''), '\D', '', 'g'); r uuid;
BEGIN
  IF NOT public.is_super_admin() THEN RETURN NULL; END IF;
  IF length(p) < 10 THEN RETURN NULL; END IF;
  SELECT l.affiliate_id INTO r FROM platform_affiliate_leads l
    JOIN platform_affiliates a ON a.id = l.affiliate_id AND a.status = 'aprovado'
   WHERE right(regexp_replace(coalesce(l.whatsapp,''), '\D', '', 'g'), 8) = right(p, 8)
     AND l.created_at >= now() - make_interval(days => (SELECT attribution_days FROM platform_affiliate_settings WHERE id=1))
   ORDER BY l.created_at ASC LIMIT 1;
  RETURN r;
END $$;

-- Registra comissão de mensalidade paga (idempotente por payment_ref)
CREATE OR REPLACE FUNCTION public.platform_affiliate_record_commission(_tenant_id uuid, _payment_ref text, _amount numeric, _paid_at timestamptz DEFAULT now())
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a platform_affiliates%ROWTYPE; n int; hold int;
BEGIN
  IF _payment_ref IS NULL OR coalesce(_amount,0) <= 0 THEN RETURN 'sem_valor'; END IF;
  SELECT af.* INTO a FROM tenants t JOIN platform_affiliates af ON af.id = t.affiliate_id WHERE t.id = _tenant_id;
  IF a.id IS NULL THEN RETURN 'sem_afiliado'; END IF;
  IF a.status <> 'aprovado' THEN RETURN 'afiliado_nao_aprovado'; END IF;
  IF EXISTS (SELECT 1 FROM platform_affiliate_commissions WHERE payment_ref = _payment_ref) THEN RETURN 'duplicada'; END IF;
  IF a.commission_months IS NOT NULL THEN
    SELECT count(*) INTO n FROM platform_affiliate_commissions WHERE affiliate_id = a.id AND tenant_id = _tenant_id AND status <> 'cancelada';
    IF n >= a.commission_months THEN RETURN 'limite_meses'; END IF;
  END IF;
  SELECT hold_days INTO hold FROM platform_affiliate_settings WHERE id = 1;
  INSERT INTO platform_affiliate_commissions (affiliate_id, tenant_id, payment_ref, valor_base, percent, valor_comissao, libera_em)
  VALUES (a.id, _tenant_id, _payment_ref, _amount, a.commission_percent, round(_amount * a.commission_percent / 100, 2),
          coalesce(_paid_at, now()) + make_interval(days => coalesce(hold,30)))
  ON CONFLICT (payment_ref) DO NOTHING;
  RETURN 'criada';
END $$;

CREATE OR REPLACE FUNCTION public.platform_affiliate_cancel_commission(_payment_ref text)
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE platform_affiliate_commissions SET status = 'cancelada'
              WHERE payment_ref = _payment_ref AND status IN ('pendente','liberada') RETURNING 1)
  SELECT count(*)::int FROM u $$;

CREATE OR REPLACE FUNCTION public.platform_affiliate_release_due()
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE platform_affiliate_commissions SET status = 'liberada'
              WHERE status = 'pendente' AND libera_em <= now() RETURNING 1)
  SELECT count(*)::int FROM u $$;

-- Registra pagamento PIX das comissões liberadas
CREATE OR REPLACE FUNCTION public.platform_affiliate_register_payout(_affiliate_id uuid, _comprovante_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total numeric; minv numeric; pid uuid; pix text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM 1 FROM platform_affiliates WHERE id = _affiliate_id FOR UPDATE;
  SELECT coalesce(sum(valor_comissao),0) INTO total FROM platform_affiliate_commissions WHERE affiliate_id = _affiliate_id AND status = 'liberada';
  SELECT min_payout INTO minv FROM platform_affiliate_settings WHERE id = 1;
  IF total <= 0 THEN RAISE EXCEPTION 'Sem comissões liberadas'; END IF;
  IF total < coalesce(minv,0) THEN RAISE EXCEPTION 'Saldo % abaixo do mínimo %', total, minv; END IF;
  SELECT pix_key INTO pix FROM platform_affiliates WHERE id = _affiliate_id;
  INSERT INTO platform_affiliate_payouts (affiliate_id, valor, pix_key, comprovante_url, created_by)
  VALUES (_affiliate_id, total, pix, _comprovante_url, auth.uid()) RETURNING id INTO pid;
  UPDATE platform_affiliate_commissions SET status = 'paga', paga_em = now(), payout_id = pid
   WHERE affiliate_id = _affiliate_id AND status = 'liberada';
  RETURN jsonb_build_object('payout_id', pid, 'valor', total);
END $$;

-- Ranking para o admin
CREATE OR REPLACE FUNCTION public.platform_affiliate_ranking()
RETURNS TABLE (affiliate_id uuid, cliques bigint, leads bigint, clientes bigint, clientes_ativos bigint, mrr numeric, comissao_total numeric, liberado numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT a.id,
    (SELECT count(*) FROM platform_affiliate_clicks c WHERE c.affiliate_id = a.id),
    (SELECT count(*) FROM platform_affiliate_leads l WHERE l.affiliate_id = a.id),
    (SELECT count(*) FROM tenants t WHERE t.affiliate_id = a.id),
    (SELECT count(*) FROM tenants t WHERE t.affiliate_id = a.id AND t.is_active AND t.subscription_ends_at > now()),
    (SELECT coalesce(sum(m.valor_base),0) FROM platform_affiliate_commissions m WHERE m.affiliate_id = a.id AND m.status <> 'cancelada' AND m.created_at >= now() - interval '30 days'),
    (SELECT coalesce(sum(m.valor_comissao),0) FROM platform_affiliate_commissions m WHERE m.affiliate_id = a.id AND m.status <> 'cancelada'),
    (SELECT coalesce(sum(m.valor_comissao),0) FROM platform_affiliate_commissions m WHERE m.affiliate_id = a.id AND m.status = 'liberada')
  FROM platform_affiliates a;
END $$;

-- Clientes do próprio afiliado (sem expor dados internos da empresa)
CREATE OR REPLACE FUNCTION public.my_platform_affiliate_clients()
RETURNS TABLE (name text, ativo boolean, attributed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name, (t.is_active AND coalesce(t.subscription_ends_at > now(), false)), t.affiliate_attributed_at
    FROM tenants t WHERE t.affiliate_id = public.my_platform_affiliate_id() AND public.my_platform_affiliate_id() IS NOT NULL $$;

REVOKE EXECUTE ON FUNCTION public.platform_affiliate_record_commission(uuid,text,numeric,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_affiliate_cancel_commission(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_affiliate_release_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_affiliate_record_commission(uuid,text,numeric,timestamptz), public.platform_affiliate_cancel_commission(text), public.platform_affiliate_release_due() TO service_role;
REVOKE EXECUTE ON FUNCTION public.platform_affiliate_attach_tenant(uuid,uuid,text), public.platform_affiliate_match_lead(text), public.platform_affiliate_register_payout(uuid,text), public.platform_affiliate_ranking(), public.my_platform_affiliate_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_affiliate_attach_tenant(uuid,uuid,text), public.platform_affiliate_match_lead(text), public.platform_affiliate_register_payout(uuid,text), public.platform_affiliate_ranking(), public.my_platform_affiliate_clients() TO authenticated, service_role;