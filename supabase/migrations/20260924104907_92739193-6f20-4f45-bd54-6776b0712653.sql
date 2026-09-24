ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS order_merge_enabled boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.get_tenant_order_merge_days(p_tenant_id uuid)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN COALESCE(order_merge_enabled, true) THEN COALESCE(order_merge_days, 0) ELSE 0 END::integer
  FROM tenants WHERE id = p_tenant_id LIMIT 1;
$$;