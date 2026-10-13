-- Tag "1ª Compra" na tela de Pedidos: devolve, para cada telefone, o id do primeiro pedido PAGO (nao cancelado) da loja.
-- Roda como o usuario (security invoker), entao o RLS de orders continua valendo.
CREATE OR REPLACE FUNCTION public.first_paid_order_by_phone(p_tenant_id uuid, p_phones text[])
RETURNS TABLE (customer_phone text, first_order_id bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (o.customer_phone) o.customer_phone, o.id
  FROM public.orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.customer_phone = ANY (p_phones)
    AND o.is_paid
    AND COALESCE(o.is_cancelled, false) = false
  ORDER BY o.customer_phone, COALESCE(o.paid_at, o.created_at), o.id;
$$;

REVOKE ALL ON FUNCTION public.first_paid_order_by_phone(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.first_paid_order_by_phone(uuid, text[]) TO authenticated, service_role;
