CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id bigint,
  p_quantity_delta integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new_stock integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF p_quantity_delta = 0 THEN
    SELECT p.stock
      INTO v_new_stock
      FROM public.products p
     WHERE p.id = p_product_id
       AND (p.tenant_id = public.get_current_tenant_id() OR public.is_super_admin());

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou sem acesso';
    END IF;

    RETURN v_new_stock;
  END IF;

  UPDATE public.products p
     SET stock = p.stock - p_quantity_delta,
         updated_at = now()
   WHERE p.id = p_product_id
     AND (p.tenant_id = public.get_current_tenant_id() OR public.is_super_admin())
     AND (p_quantity_delta < 0 OR p.stock >= p_quantity_delta)
  RETURNING p.stock INTO v_new_stock;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.products p
       WHERE p.id = p_product_id
         AND (p.tenant_id = public.get_current_tenant_id() OR public.is_super_admin())
    ) THEN
      RAISE EXCEPTION 'Produto não encontrado ou sem acesso';
    END IF;

    RAISE EXCEPTION 'Estoque insuficiente';
  END IF;

  RETURN v_new_stock;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_product_stock(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(bigint, integer) TO service_role;