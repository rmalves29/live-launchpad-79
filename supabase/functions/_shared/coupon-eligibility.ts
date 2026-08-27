// Shared helper: coupon validity window vs. order creation date.
//
// Regra de negócio: quando o cliente paga 2 ou mais pedidos de uma vez (merge),
// o desconto do cupom só pode incidir sobre os pedidos cuja DATA DE CRIAÇÃO
// esteja dentro do período de validade do cupom (starts_at / expires_at).
//
// deno-lint-ignore-file no-explicit-any

export type CouponWindow = {
  startsMs: number | null;
  expiresMs: number | null;
  discountType: string | null;
};

export async function loadCouponWindow(
  sb: any,
  tenantId: string | null | undefined,
  code: string | null | undefined,
): Promise<CouponWindow | null> {
  if (!tenantId || !code) return null;
  try {
    const { data } = await sb
      .from("coupons")
      .select("starts_at, expires_at, discount_type")
      .eq("tenant_id", tenantId)
      .eq("code", String(code).toUpperCase().trim())
      .maybeSingle();
    if (!data) return null;
    return {
      startsMs: data.starts_at ? Date.parse(data.starts_at) : null,
      expiresMs: data.expires_at ? Date.parse(data.expires_at) : null,
      discountType: data.discount_type ?? null,
    };
  } catch (err) {
    console.error("[coupon-eligibility] loadCouponWindow failed:", err);
    return null;
  }
}

/** Pedido é elegível quando foi criado dentro da janela de validade do cupom. */
export function isOrderWithinCoupon(
  createdAt: string | null | undefined,
  win: CouponWindow | null,
): boolean {
  if (!win) return true; // sem cupom conhecido -> não restringe
  if (!createdAt) return true;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return true;
  if (win.startsMs !== null && !Number.isNaN(win.startsMs) && t < win.startsMs) return false;
  if (win.expiresMs !== null && !Number.isNaN(win.expiresMs) && t > win.expiresMs) return false;
  return true;
}
