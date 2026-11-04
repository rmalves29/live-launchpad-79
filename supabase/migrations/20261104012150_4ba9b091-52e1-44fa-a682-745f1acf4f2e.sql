
CREATE OR REPLACE FUNCTION public.platform_norm_whatsapp(_t text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text := ltrim(regexp_replace(coalesce(_t,''), '\D', '', 'g'), '0');
BEGIN
  IF length(d) IN (12,13) AND left(d,2) = '55' THEN d := substr(d,3); END IF;
  IF length(d) = 10 AND substr(d,3,1) IN ('6','7','8','9') THEN d := left(d,2) || '9' || substr(d,3); END IF;
  IF length(d) NOT IN (10,11) THEN RETURN NULL; END IF;
  RETURN '55' || d;
END $$;

CREATE OR REPLACE FUNCTION public.platform_norm_instagram(_t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(regexp_replace(regexp_replace(regexp_replace(lower(trim(coalesce(_t,''))),
    '^(https?://)?(www\.)?(instagram\.com|instagr\.am)/', ''), '[/?#].*$', ''), '[^a-z0-9._]', '', 'g'), '')
$$;

ALTER TABLE public.platform_affiliate_leads
  ADD COLUMN IF NOT EXISTS empresa text,
  ADD COLUMN IF NOT EXISTS whatsapp_key text,
  ADD COLUMN IF NOT EXISTS vende_live boolean,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'indicado',
  ADD COLUMN IF NOT EXISTS meeting_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_link text,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS alert_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_error text;

UPDATE public.platform_affiliate_leads SET origem = 'landing' WHERE origem IS NULL OR origem NOT IN ('landing','afiliado','manual');
ALTER TABLE public.platform_affiliate_leads
  ADD CONSTRAINT platform_affiliate_leads_status_chk CHECK (status IN ('indicado','reuniao_agendada','reuniao_feita','fechado','pagando','perdido')),
  ADD CONSTRAINT platform_affiliate_leads_origem_chk CHECK (origem IN ('landing','afiliado','manual'));

CREATE OR REPLACE FUNCTION public.platform_affiliate_leads_normalize() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.instagram := platform_norm_instagram(NEW.instagram);
  NEW.whatsapp_key := platform_norm_whatsapp(NEW.whatsapp);
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_updated_at := now(); END IF;
  IF TG_OP = 'UPDATE' AND NEW.meeting_at IS DISTINCT FROM OLD.meeting_at THEN NEW.alert_sent_at := NULL; NEW.link_sent_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_platform_affiliate_leads_normalize ON public.platform_affiliate_leads;
CREATE TRIGGER trg_platform_affiliate_leads_normalize BEFORE INSERT OR UPDATE ON public.platform_affiliate_leads
  FOR EACH ROW EXECUTE FUNCTION public.platform_affiliate_leads_normalize();
UPDATE public.platform_affiliate_leads SET whatsapp = whatsapp;

CREATE INDEX IF NOT EXISTS idx_pal_whatsapp_key ON public.platform_affiliate_leads (whatsapp_key);
CREATE INDEX IF NOT EXISTS idx_pal_instagram ON public.platform_affiliate_leads (instagram);
CREATE INDEX IF NOT EXISTS idx_pal_status ON public.platform_affiliate_leads (status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pal_meeting_slot ON public.platform_affiliate_leads (meeting_at) WHERE status = 'reuniao_agendada' AND meeting_at IS NOT NULL;

ALTER TABLE public.platform_affiliate_settings ADD COLUMN IF NOT EXISTS agenda jsonb NOT NULL
  DEFAULT '{"dias":[1,2,3,4,5],"inicio":"09:00","fim":"18:00","tz":"America/Sao_Paulo","antecedencia_min":120,"dias_frente":14,"duracao":30}'::jsonb;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS billing_phone text, ADD COLUMN IF NOT EXISTS billing_email text;
ALTER TABLE public.tenant_onboarding_requests ADD COLUMN IF NOT EXISTS instagram text;

CREATE TABLE public.platform_pagarme_customer_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pagarme_customer_id text UNIQUE,
  pagarme_subscription_id text UNIQUE,
  matched_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_pagarme_customer_map TO authenticated;
GRANT ALL ON public.platform_pagarme_customer_map TO service_role;
ALTER TABLE public.platform_pagarme_customer_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppcm super admin" ON public.platform_pagarme_customer_map FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.platform_unmatched_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_ref text NOT NULL UNIQUE,
  pagarme_customer_id text,
  pagarme_subscription_id text,
  amount numeric NOT NULL DEFAULT 0,
  paid_at timestamptz,
  customer_name text, customer_email text, customer_phone text, customer_document text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','vinculado')),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_unmatched_payments TO authenticated;
GRANT ALL ON public.platform_unmatched_payments TO service_role;
ALTER TABLE public.platform_unmatched_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pup super admin" ON public.platform_unmatched_payments FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Registro de lead com proteção de 60 dias (first wins entre afiliadas)
CREATE OR REPLACE FUNCTION public.platform_lead_register(_affiliate_id uuid, _nome text, _empresa text, _whatsapp text, _instagram text,
  _vende_live boolean, _origem text, _notas text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w text := platform_norm_whatsapp(_whatsapp); ig text := platform_norm_instagram(_instagram); days int;
  ex platform_affiliate_leads%ROWTYPE; nm text; new_id uuid;
BEGIN
  IF w IS NULL AND ig IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Informe WhatsApp com DDD ou Instagram'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('platform_lead_register'));
  SELECT attribution_days INTO days FROM platform_affiliate_settings WHERE id = 1;
  SELECT * INTO ex FROM platform_affiliate_leads l
   WHERE ((w IS NOT NULL AND l.whatsapp_key = w) OR (ig IS NOT NULL AND l.instagram = ig))
     AND l.created_at >= now() - make_interval(days => coalesce(days, 60))
   ORDER BY (l.affiliate_id IS NULL), l.created_at ASC LIMIT 1;
  IF ex.id IS NOT NULL THEN
    IF _origem = 'afiliado' AND ex.affiliate_id IS NOT NULL THEN
      SELECT nome INTO nm FROM platform_affiliates WHERE id = ex.affiliate_id;
      RETURN jsonb_build_object('ok', false, 'conflict', true, 'lead_id', ex.id, 'owner_nome', nm, 'error', 'Esse contato já foi indicado');
    END IF;
    UPDATE platform_affiliate_leads SET
      affiliate_id = coalesce(affiliate_id, _affiliate_id),
      nome = coalesce(nullif(_nome, ''), nome), empresa = coalesce(nullif(_empresa, ''), empresa),
      whatsapp = CASE WHEN w IS NULL THEN whatsapp ELSE w END, instagram = coalesce(ig, instagram),
      vende_live = coalesce(_vende_live, vende_live),
      notas = CASE WHEN nullif(_notas, '') IS NULL THEN notas ELSE concat_ws(E'\n', notas, _notas) END
     WHERE id = ex.id;
    RETURN jsonb_build_object('ok', true, 'lead_id', ex.id, 'existing', true, 'affiliate_id', coalesce(ex.affiliate_id, _affiliate_id));
  END IF;
  INSERT INTO platform_affiliate_leads (affiliate_id, nome, empresa, whatsapp, instagram, vende_live, origem, notas)
  VALUES (_affiliate_id, coalesce(nullif(_nome, ''), 'Sem nome'), nullif(_empresa, ''), w, ig, _vende_live, _origem, nullif(_notas, ''))
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok', true, 'lead_id', new_id, 'existing', false, 'affiliate_id', _affiliate_id);
END $$;
REVOKE ALL ON FUNCTION public.platform_lead_register(uuid,text,text,text,text,boolean,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_lead_register(uuid,text,text,text,text,boolean,text,text) TO service_role;

-- Busca de indicação para Nova Empresa / Pré-cadastro (super_admin)
CREATE OR REPLACE FUNCTION public.platform_affiliate_lookup_lead(_phone text, _instagram text)
RETURNS TABLE(lead_id uuid, affiliate_id uuid, affiliate_nome text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE w text := platform_norm_whatsapp(_phone); ig text := platform_norm_instagram(_instagram);
BEGIN
  IF NOT public.is_super_admin() OR (w IS NULL AND ig IS NULL) THEN RETURN; END IF;
  RETURN QUERY SELECT l.id, a.id, a.nome FROM platform_affiliate_leads l
    JOIN platform_affiliates a ON a.id = l.affiliate_id AND a.status = 'aprovado'
   WHERE ((w IS NOT NULL AND l.whatsapp_key = w) OR (ig IS NOT NULL AND l.instagram = ig))
     AND l.created_at >= now() - make_interval(days => (SELECT coalesce(attribution_days, 60) FROM platform_affiliate_settings WHERE id = 1))
   ORDER BY l.created_at ASC LIMIT 1;
END $$;
GRANT EXECUTE ON FUNCTION public.platform_affiliate_lookup_lead(text,text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.platform_affiliate_attach_tenant(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.platform_affiliate_attach_tenant(_tenant_id uuid, _affiliate_id uuid, _phone text DEFAULT NULL, _instagram text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w text := platform_norm_whatsapp(_phone); ig text := platform_norm_instagram(_instagram); days int;
BEGIN
  IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _affiliate_id IS NULL THEN RETURN false; END IF;
  UPDATE tenants SET affiliate_id = _affiliate_id, affiliate_attributed_at = now() WHERE id = _tenant_id AND affiliate_id IS NULL;
  SELECT attribution_days INTO days FROM platform_affiliate_settings WHERE id = 1;
  IF w IS NOT NULL OR ig IS NOT NULL THEN
    UPDATE platform_affiliate_leads SET tenant_id = _tenant_id, status = CASE WHEN status = 'pagando' THEN status ELSE 'fechado' END
     WHERE affiliate_id = _affiliate_id AND tenant_id IS NULL
       AND ((w IS NOT NULL AND whatsapp_key = w) OR (ig IS NOT NULL AND instagram = ig))
       AND created_at >= now() - make_interval(days => coalesce(days, 60));
  END IF;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.platform_affiliate_attach_tenant(uuid,uuid,text,text) TO authenticated, service_role;

-- Comissão: além das regras atuais, marca a indicação como "pagando"
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
  UPDATE platform_affiliate_leads SET status = 'pagando' WHERE tenant_id = _tenant_id AND status <> 'pagando';
  RETURN 'criada';
END $$;

CREATE OR REPLACE FUNCTION public.platform_match_tenant_by_payer(_email text, _phone text, _document text)
RETURNS TABLE(tenant_id uuid, matched_by text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e text := lower(trim(coalesce(_email,''))); w text := platform_norm_whatsapp(_phone);
  d text := regexp_replace(coalesce(_document,''), '\D', '', 'g'); ids uuid[];
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_super_admin()) THEN RETURN; END IF;
  IF length(d) IN (11,14) THEN
    SELECT array_agg(DISTINCT x) INTO ids FROM (
      SELECT t.id x FROM tenants t WHERE regexp_replace(coalesce(t.company_document,''), '\D', '', 'g') = d
      UNION SELECT r.tenant_id FROM tenant_onboarding_requests r WHERE r.tenant_id IS NOT NULL AND regexp_replace(coalesce(r.cnpj,''), '\D', '', 'g') = d) s;
    IF cardinality(ids) = 1 THEN RETURN QUERY SELECT ids[1], 'documento'::text; RETURN; END IF;
  END IF;
  IF e LIKE '%_@_%' THEN
    SELECT array_agg(DISTINCT x) INTO ids FROM (
      SELECT t.id x FROM tenants t WHERE e IN (lower(t.admin_email), lower(t.billing_email), lower(t.email), lower(t.company_email))
      UNION SELECT r.tenant_id FROM tenant_onboarding_requests r WHERE r.tenant_id IS NOT NULL AND lower(r.admin_email) = e) s;
    IF cardinality(ids) = 1 THEN RETURN QUERY SELECT ids[1], 'email'::text; RETURN; END IF;
  END IF;
  IF w IS NOT NULL THEN
    SELECT array_agg(DISTINCT x) INTO ids FROM (
      SELECT t.id x FROM tenants t WHERE w IN (platform_norm_whatsapp(t.billing_phone), platform_norm_whatsapp(t.phone), platform_norm_whatsapp(t.company_phone))
      UNION SELECT r.tenant_id FROM tenant_onboarding_requests r WHERE r.tenant_id IS NOT NULL AND platform_norm_whatsapp(r.contact_phone) = w) s;
    IF cardinality(ids) = 1 THEN RETURN QUERY SELECT ids[1], 'telefone'::text; RETURN; END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.platform_match_tenant_by_payer(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_match_tenant_by_payer(text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_payment_attribute(_tenant_id uuid, _payment_ref text, _amount numeric, _paid_at timestamptz,
  _customer_id text, _subscription_id text, _matched_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_super_admin()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO platform_pagarme_customer_map (tenant_id, pagarme_customer_id, pagarme_subscription_id, matched_by)
  VALUES (_tenant_id, nullif(_customer_id,''), nullif(_subscription_id,''), _matched_by) ON CONFLICT DO NOTHING;
  res := platform_affiliate_record_commission(_tenant_id, _payment_ref, _amount, coalesce(_paid_at, now()));
  UPDATE platform_unmatched_payments SET status = 'vinculado', tenant_id = _tenant_id, linked_at = now() WHERE payment_ref = _payment_ref;
  UPDATE platform_affiliate_leads SET status = 'pagando' WHERE tenant_id = _tenant_id AND status <> 'pagando';
  RETURN jsonb_build_object('matched', true, 'tenant_id', _tenant_id, 'matched_by', _matched_by, 'commission', res);
END $$;
REVOKE ALL ON FUNCTION public.platform_payment_attribute(uuid,text,numeric,timestamptz,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_payment_attribute(uuid,text,numeric,timestamptz,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_pagarme_payment(_payment_ref text, _amount numeric, _paid_at timestamptz, _customer_id text,
  _subscription_id text, _email text, _phone text, _document text, _name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid; mby text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT m.tenant_id, 'mapeamento' INTO t, mby FROM platform_pagarme_customer_map m
   WHERE (nullif(_subscription_id,'') IS NOT NULL AND m.pagarme_subscription_id = _subscription_id)
      OR (nullif(_customer_id,'') IS NOT NULL AND m.pagarme_customer_id = _customer_id)
   ORDER BY (m.pagarme_subscription_id = _subscription_id) DESC NULLS LAST LIMIT 1;
  IF t IS NULL THEN SELECT x.tenant_id, x.matched_by INTO t, mby FROM platform_match_tenant_by_payer(_email, _phone, _document) x; END IF;
  IF t IS NULL THEN
    INSERT INTO platform_unmatched_payments (payment_ref, pagarme_customer_id, pagarme_subscription_id, amount, paid_at, customer_name, customer_email, customer_phone, customer_document)
    VALUES (_payment_ref, _customer_id, _subscription_id, coalesce(_amount,0), _paid_at, _name, _email, _phone, _document) ON CONFLICT (payment_ref) DO NOTHING;
    RETURN jsonb_build_object('matched', false);
  END IF;
  RETURN platform_payment_attribute(t, _payment_ref, _amount, _paid_at, _customer_id, _subscription_id, mby);
END $$;
REVOKE ALL ON FUNCTION public.platform_pagarme_payment(text,numeric,timestamptz,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_pagarme_payment(text,numeric,timestamptz,text,text,text,text,text,text) TO service_role;

-- "Vincular a empresa": cria o vínculo e gera comissões retroativas de todos os pagamentos pendentes do mesmo cliente/assinatura
CREATE OR REPLACE FUNCTION public.platform_link_unmatched_payment(_unmatched_id uuid, _tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u platform_unmatched_payments%ROWTYPE; p record; n int := 0; criadas int := 0; r jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO u FROM platform_unmatched_payments WHERE id = _unmatched_id;
  IF u.id IS NULL THEN RAISE EXCEPTION 'pagamento não encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = _tenant_id) THEN RAISE EXCEPTION 'empresa não encontrada'; END IF;
  FOR p IN SELECT * FROM platform_unmatched_payments
    WHERE status = 'pendente' AND (id = u.id
      OR (u.pagarme_subscription_id IS NOT NULL AND pagarme_subscription_id = u.pagarme_subscription_id)
      OR (u.pagarme_customer_id IS NOT NULL AND pagarme_customer_id = u.pagarme_customer_id))
    ORDER BY paid_at NULLS LAST
  LOOP
    r := platform_payment_attribute(_tenant_id, p.payment_ref, p.amount, p.paid_at, p.pagarme_customer_id, p.pagarme_subscription_id, 'manual');
    n := n + 1; IF r->>'commission' = 'criada' THEN criadas := criadas + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('pagamentos', n, 'comissoes', criadas);
END $$;
REVOKE ALL ON FUNCTION public.platform_link_unmatched_payment(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_link_unmatched_payment(uuid,uuid) TO authenticated;
