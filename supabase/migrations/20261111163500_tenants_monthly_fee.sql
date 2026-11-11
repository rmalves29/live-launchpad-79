-- Valor mensal pago por empresa, para o faturamento mensal estimado na tela de Empresas.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS monthly_fee numeric;

-- Preenche com a recorrência ativa, quando houver (preço dividido pelos meses do ciclo)
UPDATE public.tenants t
   SET monthly_fee = round(r.price / nullif(r.interval_months, 0), 2)
  FROM (
    SELECT DISTINCT ON (tenant_id) tenant_id, price, interval_months
      FROM public.subscription_recurrences
     WHERE status IN ('active', 'ativo', 'paid', 'pago')
     ORDER BY tenant_id, created_at DESC
  ) r
 WHERE r.tenant_id = t.id AND t.monthly_fee IS NULL;

NOTIFY pgrst, 'reload schema';
