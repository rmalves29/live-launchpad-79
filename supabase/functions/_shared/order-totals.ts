// Total do pedido — UMA regra para a cobrança (create-payment) e para as telas (loja da live e checkout público).
// Etapa 4.3 (P-07). Antes cada tela calculava do seu jeito e já houve diferença entre o que a cliente via e o
// que era cobrado (P-09; e o checkout público com "leve X pague Y").
//
// Regras (decisão do Rafael, 19/11/2026):
//  - Desconto Pix = % sobre o SUBTOTAL CHEIO dos produtos de cada pedido (antes de cupom e de promoção),
//    arredondado por pedido em centavos — exatamente como a cobrança faz.
//  - Cupom e promoções ("leve X pague Y", progressiva) são abatidos à parte.
//  - Frete entra uma vez (no primeiro pedido, na cobrança).
//  - O total nunca fica negativo antes do frete.

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Desconto Pix de cada pedido, em reais (mesma conta da cobrança: centavos = round(subtotal × %)). */
export function pixDiscountPerOrder(orderSubtotals: number[], pixPercent: number): number[] {
  const pct = Number(pixPercent) || 0;
  if (!(pct > 0)) return orderSubtotals.map(() => 0);
  return orderSubtotals.map((s) => Math.round(Math.max(0, Number(s) || 0) * pct) / 100);
}

export interface OrderTotalsInput {
  /** Subtotal de produtos de cada pedido (preço × quantidade), sem descontos. Um pedido = [subtotal]. */
  orderSubtotals: number[];
  /** Forma de pagamento escolhida ("pix", "card", "pay_on_pickup"...). Só "pix" tem desconto Pix. */
  method: string | null | undefined;
  /** % de desconto Pix do gateway que vai cobrar (0 se não tiver). */
  pixPercent: number;
  /** Cupom em reais (já calculado pela regra do cupom). */
  couponDiscount?: number;
  /** Promoções em reais ("leve X pague Y", progressiva). Na cobrança vão somadas ao cupom. */
  promoDiscount?: number;
  /** Frete em reais. */
  shipping?: number;
}

export interface OrderTotals {
  productsSubtotal: number;
  pixDiscount: number;
  couponDiscount: number;
  promoDiscount: number;
  shipping: number;
  /** O que a cliente paga. */
  total: number;
}

export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotals = input.orderSubtotals.map((s) => Math.max(0, Number(s) || 0));
  const productsSubtotal = round2(subtotals.reduce((a, b) => a + b, 0));
  const isPix = String(input.method || "").trim().toLowerCase() === "pix";
  const pixDiscount = isPix ? round2(pixDiscountPerOrder(subtotals, input.pixPercent).reduce((a, b) => a + b, 0)) : 0;
  const couponDiscount = round2(Math.max(0, Number(input.couponDiscount) || 0));
  const promoDiscount = round2(Math.max(0, Number(input.promoDiscount) || 0));
  const shipping = round2(Math.max(0, Number(input.shipping) || 0));
  const total = round2(Math.max(0, productsSubtotal - pixDiscount - couponDiscount - promoDiscount) + shipping);
  return { productsSubtotal, pixDiscount, couponDiscount, promoDiscount, shipping, total };
}
