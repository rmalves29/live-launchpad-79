import { supabase } from "@/integrations/supabase/client";

export type ShippingProvider = 'melhor_envio' | 'mandae' | null;

export interface ActiveShippingIntegration {
  provider: ShippingProvider;
  functionName: string;
  testFunctionName: string | null;
}

/**
 * Busca qual integração de frete está ativa para o tenant
 * Prioridade: Mandae > Melhor Envio
 */
export async function getActiveShippingIntegration(tenantId: string): Promise<ActiveShippingIntegration> {
  try {
    // Buscar todas as integrações ativas do tenant
    const { data: integrations, error } = await supabase
      .from("shipping_integrations")
      .select("provider, is_active, access_token")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    if (error) {
      console.error("[shipping-utils] Erro ao buscar integrações:", error);
      return { provider: null, functionName: '', testFunctionName: null };
    }

    if (!integrations || integrations.length === 0) {
      console.log("[shipping-utils] Nenhuma integração ativa encontrada");
      return { provider: null, functionName: '', testFunctionName: null };
    }

    // Verificar se Mandae está ativa (prioridade)
    const mandaeIntegration = integrations.find(i => i.provider === 'mandae' && i.access_token);
    if (mandaeIntegration) {
      console.log("[shipping-utils] Integração Mandae ativa");
      return {
        provider: 'mandae',
        functionName: 'mandae-shipping',
        testFunctionName: null // Mandae não tem função de teste de token
      };
    }

    // Verificar se Melhor Envio está ativo
    const melhorEnvioIntegration = integrations.find(i => i.provider === 'melhor_envio' && i.access_token);
    if (melhorEnvioIntegration) {
      console.log("[shipping-utils] Integração Melhor Envio ativa");
      return {
        provider: 'melhor_envio',
        functionName: 'melhor-envio-shipping',
        testFunctionName: 'melhor-envio-test-token'
      };
    }

    console.log("[shipping-utils] Nenhuma integração com token válido");
    return { provider: null, functionName: '', testFunctionName: null };
  } catch (err) {
    console.error("[shipping-utils] Erro ao determinar integração ativa:", err);
    return { provider: null, functionName: '', testFunctionName: null };
  }
}

/**
 * Verifica se o tenant possui alguma integração de frete configurada
 */
export async function hasAnyShippingIntegration(tenantId: string): Promise<boolean> {
  const integration = await getActiveShippingIntegration(tenantId);
  return integration.provider !== null;
}
