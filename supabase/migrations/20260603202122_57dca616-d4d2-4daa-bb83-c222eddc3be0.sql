CREATE OR REPLACE FUNCTION public.get_tenant_order_merge_days(p_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(order_merge_days, 0)::integer
  FROM tenants
  WHERE id = p_tenant_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_order_merge_days(uuid) TO anon, authenticated;