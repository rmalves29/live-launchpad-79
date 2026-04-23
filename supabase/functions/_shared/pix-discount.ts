// Shared helper: resolve PIX discount on the server side.
// This is the source of truth — frontend values are advisory only.
//
// Order of priority for active integration discount:
//   1) AppMax        (integration_appmax.pix_discount_percent)
//   2) Pagar.me      (integration_pagarme.pix_discount_percent)
//   3) Mercado Pago  (integration_mp.pix_discount_percent)
//   4) InfinitePay   (integration_infinitepay.pix_discount_percent)
//
// Returns { percent, value, source } where:
//   - percent is the configured discount % (0 if none / not PIX)
//   - value   is round(productsSubtotal * percent / 100, 2 decimals)
//   - source  is the provider name that supplied the discount, or null

// deno-lint-ignore-file no-explicit-any

export type PixDiscountResult = {
  percent: number;
  value: number;
  source: string | null;
};

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resolve the PIX discount for a tenant. Always recalculates server-side.
 *
 * @param sb              Supabase service-role client
 * @param tenantId        UUID of the tenant
 * @param paymentMethod   Payment method chosen by the customer ("pix", "card", etc.)
 * @param productsSubtotal Sum of (unit_price * qty) of the cart products (no shipping, no other discounts)
 */
export async function resolvePixDiscount(
  sb: any,
  tenantId: string,
  paymentMethod: string | null | undefined,
  productsSubtotal: number,
): Promise<PixDiscountResult> {
  const empty: PixDiscountResult = { percent: 0, value: 0, source: null };

  if (!tenantId) return empty;

  // Discount only applies when the customer is paying via PIX.
  const method = String(paymentMethod || "").toLowerCase().trim();
  if (method !== "pix") return empty;

  const subtotal = toNum(productsSubtotal, 0);
  if (subtotal <= 0) return empty;

  try {
    const [appmaxRes, pagarmeRes, mpRes, infRes] = await Promise.all([
      sb.from("integration_appmax")
        .select("pix_discount_percent, is_active")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      sb.from("integration_pagarme")
        .select("pix_discount_percent, is_active")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      sb.from("integration_mp")
        .select("pix_discount_percent, is_active")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      sb.from("integration_infinitepay")
        .select("pix_discount_percent, is_active")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

    let percent = 0;
    let source: string | null = null;

    const appmax = appmaxRes?.data;
    const pagarme = pagarmeRes?.data;
    const mp = mpRes?.data;
    const inf = infRes?.data;

    if (appmax?.is_active && toNum(appmax.pix_discount_percent) > 0) {
      percent = toNum(appmax.pix_discount_percent);
      source = "appmax";
    } else if (pagarme?.is_active && toNum(pagarme.pix_discount_percent) > 0) {
      percent = toNum(pagarme.pix_discount_percent);
      source = "pagarme";
    } else if (mp?.is_active && toNum(mp.pix_discount_percent) > 0) {
      percent = toNum(mp.pix_discount_percent);
      source = "mercado_pago";
    } else if (inf?.is_active && toNum(inf.pix_discount_percent) > 0) {
      percent = toNum(inf.pix_discount_percent);
      source = "infinitepay";
    }

    if (percent <= 0) return empty;

    const value = round2((subtotal * percent) / 100);
    console.log(
      `[pix-discount] tenant=${tenantId} method=${method} subtotal=${subtotal.toFixed(2)} ` +
        `percent=${percent}% value=${value.toFixed(2)} source=${source}`,
    );
    return { percent, value, source };
  } catch (err) {
    console.error("[pix-discount] resolvePixDiscount failed:", err);
    return empty;
  }
}
