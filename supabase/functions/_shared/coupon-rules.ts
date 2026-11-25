// Regra ÚNICA do desconto de cupom da Loja da Live: usada pela tela (src/lib/live-shop.ts) e pelo
// servidor (supabase/functions/live-shop). Antes eram duas cópias; qualquer diferença fazia a tela
// mostrar um desconto e o servidor cobrar outro. Sem dependências: roda no navegador e no Deno.

export type CouponRuleLine = { unitPrice: number; qty: number; promotional: boolean };

export type CouponRuleTier = {
  min_value?: number | string | null;
  max_value?: number | string | null;
  min_qty?: number | string | null;
  max_qty?: number | string | null;
  discount: number | string;
};

export type CouponRule = {
  discount_type: string;
  discount_value?: number | string | null;
  min_purchase_amount?: number | string | null;
  min_items_quantity?: number | string | null;
  progressive_tiers?: CouponRuleTier[] | null;
  apply_to_promotional?: boolean | null;
};

export type CouponResult = { ok: boolean; discount: number; message?: string };

const num = (v: unknown, d = 0) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : d;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (v: number) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");

export function computeCouponDiscount(coupon: CouponRule, lines: CouponRuleLine[]): CouponResult {
  const eligible = coupon.apply_to_promotional === false ? lines.filter((l) => !l.promotional) : lines;
  const base = eligible.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const itemCount = eligible.reduce((s, l) => s + l.qty, 0);
  if (base <= 0) return { ok: false, discount: 0, message: "Este cupom não vale para produtos em promoção." };

  const type = String(coupon.discount_type);
  if (type !== "progressive") {
    const min = num(coupon.min_purchase_amount);
    if (min > 0 && base < min) return { ok: false, discount: 0, message: `Este cupom vale em compras acima de ${money(min)}.` };
    const minItems = num(coupon.min_items_quantity);
    if (minItems > 0 && itemCount < minItems) return { ok: false, discount: 0, message: `Este cupom vale a partir de ${minItems} item(ns).` };
  }

  let discount = 0;
  if (type === "percentage") discount = (base * num(coupon.discount_value)) / 100;
  else if (type === "fixed") discount = Math.min(num(coupon.discount_value), base);
  else if (type === "progressive") {
    const tiers = Array.isArray(coupon.progressive_tiers) ? coupon.progressive_tiers : [];
    // Faixa por QUANTIDADE de produtos (min_qty/max_qty) ou por VALOR do pedido (min_value/max_value, o formato antigo)
    const tier = tiers.find((t) => t.min_qty != null
      ? itemCount >= num(t.min_qty) && (t.max_qty == null || itemCount <= num(t.max_qty))
      : base >= num(t.min_value) && (t.max_value == null || base <= num(t.max_value)));
    if (!tier) {
      const byQty = tiers.some((t) => t.min_qty != null);
      return { ok: false, discount: 0, message: byQty ? "Adicione mais produtos para atingir a faixa de desconto deste cupom." : "Seu pedido ainda não atingiu a faixa de desconto deste cupom." };
    }
    discount = (base * num(tier.discount)) / 100;
  } else return { ok: false, discount: 0, message: "Cupom inválido." };

  discount = round2(Math.min(discount, base));
  return discount > 0 ? { ok: true, discount } : { ok: false, discount: 0, message: "Cupom sem desconto para este pedido." };
}
