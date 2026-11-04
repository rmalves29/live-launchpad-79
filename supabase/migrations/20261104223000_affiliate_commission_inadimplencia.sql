-- Afiliados: indicado que parou de pagar não gera valor para a afiliada.
-- 1) Comissão só nasce de pagamento confirmado (já era assim: charge.paid).
-- 2) Comissão em carência só é liberada se a empresa indicada continua em dia.
--    Se a empresa ficou inadimplente (assinatura vencida há mais que a tolerância), a comissão é cancelada.
-- 3) Estorno/chargeback continua cancelando, agora com o motivo registrado.

ALTER TABLE public.platform_affiliate_commissions
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS cancelada_em timestamptz;

ALTER TABLE public.platform_affiliate_settings
  ADD COLUMN IF NOT EXISTS inadimplencia_tolerancia_dias integer NOT NULL DEFAULT 5;

CREATE OR REPLACE FUNCTION public.platform_affiliate_release_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tol int; liberadas int; canceladas int;
BEGIN
  SELECT coalesce(inadimplencia_tolerancia_dias, 5) INTO tol FROM platform_affiliate_settings WHERE id = 1;
  tol := coalesce(tol, 5);

  -- Empresa em dia: libera
  WITH u AS (
    UPDATE platform_affiliate_commissions c SET status = 'liberada'
      FROM tenants t
     WHERE c.tenant_id = t.id AND c.status = 'pendente' AND c.libera_em <= now()
       AND t.is_active AND NOT coalesce(t.is_blocked, false)
       AND t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at > now()
    RETURNING 1)
  SELECT count(*) INTO liberadas FROM u;

  -- Empresa parou de pagar (vencida além da tolerância, bloqueada ou desativada): cancela
  WITH u AS (
    UPDATE platform_affiliate_commissions c
       SET status = 'cancelada', cancelada_em = now(), motivo_cancelamento = 'cliente_parou_de_pagar'
      FROM tenants t
     WHERE c.tenant_id = t.id AND c.status = 'pendente' AND c.libera_em <= now()
       AND (NOT t.is_active OR coalesce(t.is_blocked, false)
            OR t.subscription_ends_at IS NULL OR t.subscription_ends_at < now() - make_interval(days => tol))
    RETURNING 1)
  SELECT count(*) INTO canceladas FROM u;

  -- Empresa apagada: cancela
  UPDATE platform_affiliate_commissions c
     SET status = 'cancelada', cancelada_em = now(), motivo_cancelamento = 'empresa_removida'
   WHERE c.status = 'pendente' AND c.libera_em <= now()
     AND (c.tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = c.tenant_id));

  -- Vencida há menos que a tolerância: continua pendente esperando a renovação
  RETURN liberadas;
END $$;

CREATE OR REPLACE FUNCTION public.platform_affiliate_cancel_commission(_payment_ref text)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE platform_affiliate_commissions
                SET status = 'cancelada', cancelada_em = now(), motivo_cancelamento = 'estorno_ou_chargeback'
              WHERE payment_ref = _payment_ref AND status IN ('pendente','liberada') RETURNING 1)
  SELECT count(*)::int FROM u $$;

REVOKE ALL ON FUNCTION public.platform_affiliate_release_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_affiliate_cancel_commission(text) FROM PUBLIC, anon, authenticated;
