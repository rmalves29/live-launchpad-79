// Planos por módulo (assinatura mensal recorrente no cartão, via Pagar.me).
// O preço e os módulos liberados são decididos AQUI, no servidor: o valor que vem do navegador é ignorado.
// Os planos antigos (basic/pro/enterprise) não passam por aqui e continuam como estavam.

export type ModuleFlags = { enable_live: boolean; enable_loja_live: boolean; enable_sendflow: boolean };

export const MODULE_PLANS: Record<string, { name: string; price: number; flags: ModuleFlags }> = {
  live: {
    name: "Sistema Live",
    price: 299,
    flags: { enable_live: true, enable_loja_live: true, enable_sendflow: false },
  },
  grupos_vip: {
    name: "Sistema de Grupos VIP",
    price: 299,
    flags: { enable_live: false, enable_loja_live: false, enable_sendflow: true },
  },
  completo: {
    name: "Pacote Completo",
    price: 499,
    flags: { enable_live: true, enable_loja_live: true, enable_sendflow: true },
  },
};

export function getModulePlan(planId: string | null | undefined) {
  return planId && Object.prototype.hasOwnProperty.call(MODULE_PLANS, planId) ? MODULE_PLANS[planId] : null;
}

/** Os links recorrentes da Pagar.me são criados com o nome do plano ("Sistema Live", "Pacote Completo"...). */
export function planKeyByName(name: string | null | undefined): string | null {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  for (const [key, plan] of Object.entries(MODULE_PLANS)) if (plan.name.toLowerCase() === n) return key;
  return null;
}

/**
 * Descobre qual plano por módulo uma assinatura da Pagar.me representa (para o link compartilhado, que chega sem empresa).
 * Pelo plano da assinatura (id guardado em pagarme_recurring_links, ou o nome do plano); sem isso, devolve null.
 */
export async function planKeyForSubscription(
  supabase: { from: (t: string) => any },
  apiKey: string | undefined,
  subscriptionId: string | null | undefined,
): Promise<string | null> {
  if (!apiKey || !subscriptionId) return null;
  try {
    const r = await fetch(`https://api.pagar.me/core/v5/subscriptions/${subscriptionId}`, {
      headers: { Authorization: "Basic " + btoa(`${apiKey}:`) },
    });
    if (!r.ok) return null;
    const sub = await r.json();
    const planId: string | undefined = sub?.plan?.id || sub?.plan_id;
    if (planId) {
      const { data: link } = await supabase.from("pagarme_recurring_links").select("name").eq("pagarme_plan_id", planId).limit(1).maybeSingle();
      const byLink = planKeyByName(link?.name);
      if (byLink) return byLink;
    }
    return planKeyByName(sub?.plan?.name);
  } catch {
    return null;
  }
}
