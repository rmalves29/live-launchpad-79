-- Migration: Corrigir RLS para merge de pedidos e fretes personalizados
-- Bug 1: useOrderMerge usava .from('orders') direto — agora bloqueado pela nova policy RLS anon
-- Bug 2: custom_shipping_options sem policy pública — checkout anon não conseguia ler

-- ============================================================
-- FIX BUG 1: RPC para buscar pedidos pagos do cliente (usado pelo merge de frete)
-- Aceita tenant_id (UUID) pois o hook useOrderMerge usa o id, não o slug
-- ============================================================

CREATE OR REPLACE FUNCTION get_paid_orders_for_merge(
  p_tenant_id   uuid,
  p_customer_phone text,
  p_from_date   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id            bigint,
  created_at    timestamptz,
  total_amount  numeric,
  customer_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.created_at,
    o.total_amount,
    o.customer_phone
  FROM orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.is_paid = true
    AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
    AND (p_from_date IS NULL OR o.created_at >= p_from_date)
    AND (
      o.customer_phone = p_customer_phone
      OR regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
         = regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
    )
  ORDER BY o.created_at DESC;
END;
$$;

-- Permitir que usuários anônimos (checkout público) e autenticados chamem a função
GRANT EXECUTE ON FUNCTION get_paid_orders_for_merge(uuid, text, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION get_paid_orders_for_merge(uuid, text, timestamptz) TO authenticated;

-- ============================================================
-- FIX BUG 2: Policy pública para custom_shipping_options
-- Permite que o checkout anon leia fretes ativos do tenant
-- ============================================================

-- Habilitar RLS caso ainda não esteja
ALTER TABLE IF EXISTS custom_shipping_options ENABLE ROW LEVEL SECURITY;

-- Remover policy antiga se existir
DROP POLICY IF EXISTS "Public can view active custom shipping options" ON custom_shipping_options;

-- Policy: qualquer um pode LER opções de frete ativas (não autenticado = checkout público)
CREATE POLICY "Public can view active custom shipping options"
ON custom_shipping_options
FOR SELECT
USING (is_active = true);

-- Policy: apenas membros autenticados do tenant podem gerenciar seus fretes
DROP POLICY IF EXISTS "Tenant members can manage custom shipping options" ON custom_shipping_options;

CREATE POLICY "Tenant members can manage custom shipping options"
ON custom_shipping_options
FOR ALL
USING (
  tenant_id IN (
    SELECT tu.tenant_id
    FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )
);
