-- Migration: Corrigir policy RLS insegura de orders e criar RPC segura para checkout público
-- Problema: A policy "Public can view orders by phone" usava USING (true), expondo TODOS os
-- pedidos de TODOS os tenants para qualquer request não autenticado.
-- Solução: Criar RPC com SECURITY DEFINER que filtra por tenant_slug + customer_phone,
-- e substituir a policy por uma que exige autenticação.

-- ============================================================
-- ETAPA 1: Criar função RPC segura para o checkout público
-- O PublicCheckout.tsx irá usar esta função em vez de .from('orders') direto
-- ============================================================

CREATE OR REPLACE FUNCTION get_orders_by_phone_public(
  p_tenant_slug text,
  p_customer_phone text
)
RETURNS TABLE (
  id          bigint,
  tenant_id   uuid,
  customer_phone text,
  customer_name  text,
  event_type     text,
  event_date     text,
  total_amount   numeric,
  is_paid        boolean,
  is_cancelled   boolean,
  payment_link   text,
  cart_id        bigint,
  items          jsonb,
  coupon_code    text,
  coupon_discount numeric,
  gift_name       text,
  created_at      timestamptz,
  pix_discount    numeric,
  merged_order_ids jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Buscar tenant_id pelo slug (apenas tenants ativos)
  SELECT t.id INTO v_tenant_id
  FROM tenants t
  WHERE t.slug = p_tenant_slug
    AND t.is_active = true
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN; -- Tenant não encontrado ou inativo
  END IF;

  -- Retornar apenas os pedidos do tenant + telefone do cliente
  -- Aceita telefone normalizado ou com formatação
  RETURN QUERY
  SELECT
    o.id,
    o.tenant_id,
    o.customer_phone,
    o.customer_name,
    o.event_type,
    o.event_date,
    o.total_amount,
    o.is_paid,
    COALESCE(o.is_cancelled, false) AS is_cancelled,
    o.payment_link,
    o.cart_id,
    o.items,
    o.coupon_code,
    o.coupon_discount,
    o.gift_name,
    o.created_at,
    o.pix_discount,
    o.merged_order_ids
  FROM orders o
  WHERE o.tenant_id = v_tenant_id
    AND (
      o.customer_phone = p_customer_phone
      OR o.customer_phone = regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
      OR regexp_replace(o.customer_phone, '[^0-9]', '', 'g') = regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
    );
END;
$$;

-- Garantir que apenas usuários anônimos (e autenticados) podem chamar esta função
GRANT EXECUTE ON FUNCTION get_orders_by_phone_public(text, text) TO anon;
GRANT EXECUTE ON FUNCTION get_orders_by_phone_public(text, text) TO authenticated;

-- ============================================================
-- ETAPA 2: Substituir policy insegura por policy restrita
-- ATENÇÃO: Só executar após confirmar que o frontend usa a RPC acima
-- ============================================================

-- Remover policy insegura (USING true)
DROP POLICY IF EXISTS "Public can view orders by phone" ON public.orders;

-- Política para membros autenticados do tenant
CREATE POLICY "Tenant members can view their orders"
ON public.orders
FOR SELECT
USING (
  -- Membros do tenant podem ver pedidos do seu tenant
  tenant_id IN (
    SELECT tu.tenant_id
    FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
  )
  OR
  -- Super admin pode ver tudo
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )
);
