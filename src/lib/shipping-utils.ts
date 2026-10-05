import { supabase } from "@/integrations/supabase/client";

export type ShippingProvider = 'melhor_envio' | 'mandae' | 'mandabem' | 'correios' | 'meuscorreios' | 'superfrete' | 'frenet' | null;

export interface ActiveShippingIntegration {
  provider: ShippingProvider;
  functionName: string;
  testFunctionName: string | null;
}

const PROVIDER_PRIORITY: Array<{ provider: Exclude<ShippingProvider, null>; functionName: string; testFunctionName: string | null }> = [
  { provider: 'superfrete', functionName: 'superfrete-shipping', testFunctionName: null },
  { provider: 'frenet', functionName: 'frenet-shipping', testFunctionName: null },
  { provider: 'mandae', functionName: 'mandae-shipping', testFunctionName: null },
  { provider: 'mandabem', functionName: 'mandabem-shipping', testFunctionName: null },
  { provider: 'melhor_envio', functionName: 'melhor-envio-shipping', testFunctionName: 'melhor-envio-test-token' },
  { provider: 'correios', functionName: 'correios-shipping', testFunctionName: null },
  { provider: 'meuscorreios', functionName: 'meuscorreios-shipping', testFunctionName: null },
];

/** Nome exibido ao cliente no checkout para cada integração. */
export function shippingProviderLabel(provider: ShippingProvider): string {
  switch (provider) {
    case 'mandae': return 'Mandae';
    case 'mandabem': return 'Manda Bem';
    case 'superfrete': return 'SuperFrete';
    case 'frenet': return 'Frenet';
    case 'correios':
    case 'meuscorreios': return 'Correios';
    default: return 'Melhor Envio';
  }
}

/**
 * Todas as integrações de frete ativas do tenant (até 2), na ordem de prioridade.
 * O checkout consulta todas e junta as opções; o cliente escolhe entre elas.
 */
export async function getActiveShippingIntegrations(tenantId: string): Promise<ActiveShippingIntegration[]> {
  try {
    if (!tenantId) return [];

    // IMPORTANTE: usamos uma função SECURITY DEFINER (get_active_shipping_provider)
    // para que o checkout público (anon) consiga ler o provider sem precisar de
    // policy SELECT na tabela shipping_integrations (que contém tokens sensíveis).
    const { data: integrations, error } = await supabase
      .rpc("get_active_shipping_provider" as any, { tenant_uuid: tenantId });

    if (error) {
      console.error("[shipping-utils] Erro ao buscar integrações:", error);
      return [];
    }
    if (!integrations || integrations.length === 0) return [];

    const active = new Set((integrations as Array<{ provider: string }>).map((i) => i.provider));
    return PROVIDER_PRIORITY
      .filter((p) => active.has(p.provider))
      .map((p) => ({ provider: p.provider, functionName: p.functionName, testFunctionName: p.testFunctionName }));
  } catch (err) {
    console.error("[shipping-utils] Erro ao determinar integrações ativas:", err);
    return [];
  }
}

/**
 * Integração de frete "principal" do tenant (a de maior prioridade entre as ativas).
 * Usada onde só uma integração faz sentido (ex.: etiquetas de pedidos antigos, sem transportadora gravada).
 * Prioridade: SuperFrete > Frenet > Mandae > Manda Bem > Melhor Envio > Correios > MeusCorreios
 */
export async function getActiveShippingIntegration(tenantId: string): Promise<ActiveShippingIntegration> {
  const all = await getActiveShippingIntegrations(tenantId);
  return all[0] ?? { provider: null, functionName: '', testFunctionName: null };
}

/** Integração de frete de um provider específico (ex.: o gravado no pedido). */
export function shippingIntegrationFor(provider: ShippingProvider): ActiveShippingIntegration {
  const found = PROVIDER_PRIORITY.find((p) => p.provider === provider);
  return found
    ? { provider: found.provider, functionName: found.functionName, testFunctionName: found.testFunctionName }
    : { provider: null, functionName: '', testFunctionName: null };
}

/**
 * Verifica se o tenant possui alguma integração de frete configurada
 */
export async function hasAnyShippingIntegration(tenantId: string): Promise<boolean> {
  const integration = await getActiveShippingIntegration(tenantId);
  return integration.provider !== null;
}
