-- Correções da validação de segurança de 06/11/2026 (relatório seguranca/relatorios/2026-11-06-codigo.md)
-- SEG-002, SEG-004, SEG-006 e ajuste do chamador interno do envio de WhatsApp (SEG-001).
-- Não altera dados; só permissões e corpo de funções.

-- SEG-002: resumo da agenda (nomes/telefones de leads) não pode ser chamado pela API pública.
-- O cron "agenda-resumo-diario" roda como postgres e continua funcionando.
REVOKE EXECUTE ON FUNCTION public.agenda_resumo_dia(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_resumo_dia(date) TO service_role;

-- SEG-006: lista de todas as empresas clientes só para usuários logados (troca de loja do super admin).
REVOKE EXECUTE ON FUNCTION public.list_active_tenants_basic() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_tenants_basic() TO authenticated, service_role;

-- SEG-004: o checkout só precisa saber SE o cliente tem pedido pago no período (frete grátis de junção).
-- Nova função responde apenas verdadeiro/falso, sem IDs, datas ou valores.
CREATE OR REPLACE FUNCTION public.has_paid_order_for_merge(
  p_tenant_id uuid,
  p_customer_phone text,
  p_from_date timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.is_paid = true
      AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
      AND (p_from_date IS NULL OR o.created_at >= p_from_date)
      AND length(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g')) >= 10
      AND regexp_replace(o.customer_phone, '[^0-9]', '', 'g') = regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_paid_order_for_merge(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_paid_order_for_merge(uuid, text, timestamptz) TO anon, authenticated, service_role;

-- A função antiga (que devolve a lista de pedidos) sai da API pública e passa a exigir a própria loja.
CREATE OR REPLACE FUNCTION public.get_paid_orders_for_merge(
  p_tenant_id uuid,
  p_customer_phone text,
  p_from_date timestamptz DEFAULT NULL
) RETURNS TABLE(id bigint, created_at timestamptz, total_amount numeric, customer_phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_super_admin() OR p_tenant_id = public.get_current_tenant_id()) THEN
    RAISE EXCEPTION 'forbidden_other_tenant' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT o.id, o.created_at, o.total_amount, o.customer_phone
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.is_paid = true
    AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
    AND (p_from_date IS NULL OR o.created_at >= p_from_date)
    AND (
      o.customer_phone = p_customer_phone
      OR regexp_replace(o.customer_phone, '[^0-9]', '', 'g') = regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
    )
  ORDER BY o.created_at DESC;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_paid_orders_for_merge(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paid_orders_for_merge(uuid, text, timestamptz) TO authenticated, service_role;

-- SEG-001 (chamador interno): o aviso de reunião para o Rafael chama zapi-send-message pelo banco.
-- Com a função protegida, o banco passa a enviar o cabeçalho x-internal-key.
-- O valor fica em agenda_config (chave 'internal_functions_key', sem acesso pela API) e no secret
-- INTERNAL_FUNCTIONS_KEY das edge functions. Os dois são cadastrados na implantação, nunca no repositório.
CREATE OR REPLACE FUNCTION public.agenda_whats_rafael(msg text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $function$
begin
  perform net.http_post(
    url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', coalesce(public.agenda_cfg('internal_functions_key'), '')
    ),
    body := jsonb_build_object(
      'tenant_id', public.agenda_cfg('tenant_aviso_rafael'),
      'phone', public.agenda_cfg('telefone_rafael'),
      'message', msg
    ),
    timeout_milliseconds := 60000
  );
end
$function$;
-- Permissões de agenda_whats_rafael não mudam (já não era executável por anon/authenticated).
