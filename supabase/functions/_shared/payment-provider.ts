// Qual gateway cobra o pedido da loja. Regra única (decisão de 19/11/2026):
// quando a loja tem mais de um gateway ativo, vale a ordem InfinitePay > Pagar.me > Mercado Pago. (App Max removida do sistema em 19/11/2026.)
// Desconto do Pix, métodos aceitos e a própria cobrança têm que vir sempre deste mesmo gateway.
import { getActiveTenantMpToken } from "./tenant-mp-token.ts";

export type ChargingProvider = "infinitepay" | "pagarme" | "mercado_pago";

export const CHARGING_ORDER: ChargingProvider[] = ["infinitepay", "pagarme", "mercado_pago"];

type Row = Record<string, any> | null | undefined;

export function chargingProvider(rows: { infinitepay?: Row; pagarme?: Row; mercado_pago?: Row }): ChargingProvider | null {
  if (rows.infinitepay?.is_active && rows.infinitepay?.handle) return "infinitepay";
  if (rows.pagarme?.is_active && rows.pagarme?.api_key) return "pagarme";
  if (getActiveTenantMpToken(rows.mercado_pago as any)) return "mercado_pago";
  return null;
}
