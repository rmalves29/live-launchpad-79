-- ============================================================
-- FIX: Frete não aparece no checkout público (FL Semi Joias e outros)
-- ============================================================
-- Causa: a tabela shipping_integrations tem RLS habilitado mas
-- nenhuma policy de SELECT pública. Por isso o checkout (anon) não
-- consegue saber qual provider (Melhor Envio/Mandae/etc) está ativo
-- e nunca exibe as opções de frete reais.
--
-- Solução: criar uma função SECURITY DEFINER que retorna apenas
-- provider/is_active (SEM expor tokens, client_secret, refresh_token).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_active_shipping_provider(tenant_uuid uuid)
RETURNS TABLE(provider text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT si.provider::text, si.is_active
  FROM public.shipping_integrations si
  WHERE si.tenant_id = tenant_uuid
    AND si.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_shipping_provider(uuid) TO anon, authenticated;

-- Verificação:
-- SELECT * FROM public.get_active_shipping_provider('b22bb1e6-e9a1-4469-aa4e-57ab13f29321');
-- Deve retornar: melhor_envio | true
