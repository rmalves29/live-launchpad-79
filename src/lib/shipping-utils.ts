import { supabase } from "@/integrations/supabase/client";

export type ShippingProvider = 'melhor_envio' | 'mandae' | 'correios' | null;

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
    if (!tenantId) {
      console.log("[shipping-utils] tenant_id não fornecido");
      return { provider: null, functionName: '', testFunctionName: null };
    }

    // Buscar integrações ativas do tenant específico
    // IMPORTANTE: Filtra explicitamente por tenant_id para garantir isolamento
    const { data: integrations, error } = await supabase
      .from("shipping_integrations")
      .select("provider, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    if (error) {
      console.error("[shipping-utils] Erro ao buscar integrações:", error);
      return { provider: null, functionName: '', testFunctionName: null };
    }

    if (!integrations || integrations.length === 0) {
      console.log("[shipping-utils] Nenhuma integração ativa encontrada para tenant:", tenantId);
      return { provider: null, functionName: '', testFunctionName: null };
    }

    console.log("[shipping-utils] Integrações encontradas para tenant", tenantId, ":", integrations);

    // Verificar se Mandae está ativa (prioridade)
    const mandaeIntegration = integrations.find(i => i.provider === 'mandae');
    if (mandaeIntegration) {
      console.log("[shipping-utils] Integração Mandae ativa para tenant:", tenantId);
      return {
        provider: 'mandae',
        functionName: 'mandae-shipping',
        testFunctionName: null // Mandae não tem função de teste de token
      };
    }

    // Verificar se Melhor Envio está ativo
    const melhorEnvioIntegration = integrations.find(i => i.provider === 'melhor_envio');
    if (melhorEnvioIntegration) {
      console.log("[shipping-utils] Integração Melhor Envio ativa para tenant:", tenantId);
      return {
        provider: 'melhor_envio',
        functionName: 'melhor-envio-shipping',
        testFunctionName: 'melhor-envio-test-token'
      };
    }

    // Verificar se Correios está ativo
    const correiosIntegration = integrations.find(i => i.provider === 'correios');
    if (correiosIntegration) {
      console.log("[shipping-utils] Integração Correios ativa para tenant:", tenantId);
      return {
        provider: 'correios',
        functionName: 'correios-shipping',
        testFunctionName: null
      };
    }

    console.log("[shipping-utils] Nenhuma integração válida para tenant:", tenantId);
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
