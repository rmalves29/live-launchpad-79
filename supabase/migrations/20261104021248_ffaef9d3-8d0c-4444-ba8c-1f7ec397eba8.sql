-- Contratação direta (self-service) pela landing de indicação
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS signup_status text,
  ADD COLUMN IF NOT EXISTS signup_token uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS signup_payment_url text,
  ADD COLUMN IF NOT EXISTS signup_plan text,
  ADD COLUMN IF NOT EXISTS signup_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS signup_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_meeting_at timestamptz;
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_signup_status_chk;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_signup_status_chk CHECK (signup_status IS NULL OR signup_status IN ('aguardando_pagamento','pago','expirado'));

ALTER TABLE public.platform_affiliate_leads ADD COLUMN IF NOT EXISTS meeting_type text NOT NULL DEFAULT 'apresentacao';
ALTER TABLE public.platform_affiliate_leads DROP CONSTRAINT IF EXISTS platform_affiliate_leads_meeting_type_chk;
ALTER TABLE public.platform_affiliate_leads ADD CONSTRAINT platform_affiliate_leads_meeting_type_chk CHECK (meeting_type IN ('apresentacao','onboarding'));
ALTER TABLE public.platform_affiliate_leads DROP CONSTRAINT IF EXISTS platform_affiliate_leads_status_chk;
ALTER TABLE public.platform_affiliate_leads ADD CONSTRAINT platform_affiliate_leads_status_chk CHECK (status IN ('indicado','reuniao_agendada','reuniao_feita','aguardando_pagamento','expirado','fechado','pagando','perdido'));
ALTER TABLE public.platform_affiliate_leads DROP CONSTRAINT IF EXISTS platform_affiliate_leads_origem_chk;
ALTER TABLE public.platform_affiliate_leads ADD CONSTRAINT platform_affiliate_leads_origem_chk CHECK (origem IN ('landing','afiliado','manual','self_signup'));
DROP INDEX IF EXISTS public.uq_pal_meeting_slot;
CREATE UNIQUE INDEX uq_pal_meeting_slot ON public.platform_affiliate_leads (meeting_at)
  WHERE meeting_at IS NOT NULL AND (status = 'reuniao_agendada' OR meeting_type = 'onboarding');

ALTER TABLE public.platform_pagarme_customer_map
  ADD COLUMN IF NOT EXISTS document text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone_key text;
CREATE INDEX IF NOT EXISTS idx_ppcm_document ON public.platform_pagarme_customer_map (document);
CREATE INDEX IF NOT EXISTS idx_ppcm_email ON public.platform_pagarme_customer_map (email);
CREATE INDEX IF NOT EXISTS idx_ppcm_phone ON public.platform_pagarme_customer_map (phone_key);

ALTER TABLE public.platform_affiliate_settings
  ADD COLUMN IF NOT EXISTS plan_price numeric NOT NULL DEFAULT 299,
  ADD COLUMN IF NOT EXISTS fallback_payment_url text,
  ADD COLUMN IF NOT EXISTS signup_pagarme_plan_id text,
  ADD COLUMN IF NOT EXISTS signup_pagarme_plan_price numeric;

-- Cadastros não pagos em 7 dias ficam expirados (nunca apagados)
CREATE OR REPLACE FUNCTION public.platform_signup_expire()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_super_admin()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH t AS (
    UPDATE tenants SET signup_status = 'expirado'
     WHERE signup_status = 'aguardando_pagamento' AND signup_created_at < now() - interval '7 days' RETURNING id)
  UPDATE platform_affiliate_leads l SET status = 'expirado', status_updated_at = now()
    FROM t WHERE l.tenant_id = t.id AND l.status = 'aguardando_pagamento';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Ativa o cadastro self-service quando o pagamento casa com o tenant (webhook e "Vincular a empresa")
CREATE OR REPLACE FUNCTION public.platform_signup_activate(_tenant_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tenants%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_super_admin()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO t FROM tenants WHERE id = _tenant_id FOR UPDATE;
  IF t.id IS NULL OR coalesce(t.signup_status,'') NOT IN ('aguardando_pagamento','expirado') THEN RETURN false; END IF;
  UPDATE tenants SET signup_status = 'pago', signup_paid_at = now(), is_active = true, is_blocked = false,
    plan_type = coalesce(t.signup_plan, 'live'),
    subscription_ends_at = now() + interval '1 month',
    enable_live = coalesce(t.signup_plan,'live') IN ('live','completo'),
    enable_loja_live = coalesce(t.signup_plan,'live') IN ('live','completo'),
    enable_sendflow = coalesce(t.signup_plan,'live') IN ('grupos_vip','completo')
  WHERE id = _tenant_id;
  UPDATE platform_affiliate_leads SET status = 'fechado', status_updated_at = now()
   WHERE tenant_id = _tenant_id AND status IN ('aguardando_pagamento','expirado','indicado','reuniao_feita');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.platform_payment_attribute(_tenant_id uuid, _payment_ref text, _amount numeric, _paid_at timestamp with time zone, _customer_id text, _subscription_id text, _matched_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res text; act boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_super_admin()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO platform_pagarme_customer_map (tenant_id, pagarme_customer_id, pagarme_subscription_id, matched_by)
  VALUES (_tenant_id, nullif(_customer_id,''), nullif(_subscription_id,''), _matched_by) ON CONFLICT DO NOTHING;
  act := platform_signup_activate(_tenant_id);
  res := platform_affiliate_record_commission(_tenant_id, _payment_ref, _amount, coalesce(_paid_at, now()));
  UPDATE platform_unmatched_payments SET status = 'vinculado', tenant_id = _tenant_id, linked_at = now() WHERE payment_ref = _payment_ref;
  UPDATE platform_affiliate_leads SET status = 'pagando' WHERE tenant_id = _tenant_id AND status <> 'pagando' AND affiliate_id IS NOT NULL AND res IN ('criada','duplicada');
  RETURN jsonb_build_object('matched', true, 'tenant_id', _tenant_id, 'matched_by', _matched_by, 'commission', res, 'activated', act);
END $$;

CREATE OR REPLACE FUNCTION public.platform_pagarme_payment(_payment_ref text, _amount numeric, _paid_at timestamp with time zone, _customer_id text, _subscription_id text, _email text, _phone text, _document text, _name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid; mby text; d text := regexp_replace(coalesce(_document,''), '\D', '', 'g');
  e text := lower(trim(coalesce(_email,''))); w text := platform_norm_whatsapp(_phone);
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT m.tenant_id, 'mapeamento' INTO t, mby FROM platform_pagarme_customer_map m
   WHERE (nullif(_subscription_id,'') IS NOT NULL AND m.pagarme_subscription_id = _subscription_id)
      OR (nullif(_customer_id,'') IS NOT NULL AND m.pagarme_customer_id = _customer_id)
   ORDER BY (m.pagarme_subscription_id = _subscription_id) DESC NULLS LAST LIMIT 1;
  -- Cadastro self-service: dados gravados na contratação (documento > e-mail > telefone), só se apontar para uma empresa
  IF t IS NULL AND length(d) IN (11,14) THEN
    SELECT CASE WHEN count(DISTINCT tenant_id) = 1 THEN min(tenant_id::text)::uuid END INTO t FROM platform_pagarme_customer_map WHERE document = d;
    IF t IS NOT NULL THEN mby := 'contratacao_documento'; END IF;
  END IF;
  IF t IS NULL AND e LIKE '%_@_%' THEN
    SELECT CASE WHEN count(DISTINCT tenant_id) = 1 THEN min(tenant_id::text)::uuid END INTO t FROM platform_pagarme_customer_map WHERE email = e;
    IF t IS NOT NULL THEN mby := 'contratacao_email'; END IF;
  END IF;
  IF t IS NULL AND w IS NOT NULL THEN
    SELECT CASE WHEN count(DISTINCT tenant_id) = 1 THEN min(tenant_id::text)::uuid END INTO t FROM platform_pagarme_customer_map WHERE phone_key = w;
    IF t IS NOT NULL THEN mby := 'contratacao_telefone'; END IF;
  END IF;
  IF t IS NULL THEN SELECT x.tenant_id, x.matched_by INTO t, mby FROM platform_match_tenant_by_payer(_email, _phone, _document) x; END IF;
  IF t IS NULL THEN
    INSERT INTO platform_unmatched_payments (payment_ref, pagarme_customer_id, pagarme_subscription_id, amount, paid_at, customer_name, customer_email, customer_phone, customer_document)
    VALUES (_payment_ref, _customer_id, _subscription_id, coalesce(_amount,0), _paid_at, _name, _email, _phone, _document) ON CONFLICT (payment_ref) DO NOTHING;
    RETURN jsonb_build_object('matched', false);
  END IF;
  RETURN platform_payment_attribute(t, _payment_ref, _amount, _paid_at, _customer_id, _subscription_id, mby);
END $$;

REVOKE ALL ON FUNCTION public.platform_signup_expire() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_signup_activate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_signup_expire() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_signup_activate(uuid) TO authenticated, service_role;