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
