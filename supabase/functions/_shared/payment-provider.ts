// Qual gateway cobra o pedido da loja. Regra única (decisão de 19/11/2026):
// quando a loja tem mais de um gateway ativo, vale a ordem InfinitePay > App Max > Pagar.me > Mercado Pago.
// Desconto do Pix, métodos aceitos e a própria cobrança têm que vir sempre deste mesmo gateway.
import { getActiveTenantMpToken } from "./tenant-mp-token.ts";

export type ChargingProvider = "infinitepay" | "appmax" | "pagarme" | "mercado_pago";

export const CHARGING_ORDER: ChargingProvider[] = ["infinitepay", "appmax", "pagarme", "mercado_pago"];

type Row = Record<string, any> | null | undefined;

export function chargingProvider(rows: { infinitepay?: Row; appmax?: Row; pagarme?: Row; mercado_pago?: Row }): ChargingProvider | null {
  if (rows.infinitepay?.is_active && rows.infinitepay?.handle) return "infinitepay";
  if (rows.appmax?.is_active && rows.appmax?.access_token) return "appmax";
  if (rows.pagarme?.is_active && rows.pagarme?.api_key) return "pagarme";
  if (getActiveTenantMpToken(rows.mercado_pago as any)) return "mercado_pago";
  return null;
}
