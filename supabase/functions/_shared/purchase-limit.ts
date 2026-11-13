// Limite de compra por cliente (Promoções > Limite por cliente).
// O banco recusa o item com a mensagem "LIMITE_POR_CLIENTE|max|scope|restante|codigo|nome"
// (trigger enforce_purchase_limits). Aqui se lê esse erro e se monta o aviso para a cliente.

export interface PurchaseLimitHit {
  max: number;
  scope: "per_product" | "combined";
  remaining: number;
  code: string;
  name: string;
}

export function parsePurchaseLimitError(err: unknown): PurchaseLimitHit | null {
  const msg = String((err as any)?.message ?? err ?? "");
  const i = msg.indexOf("LIMITE_POR_CLIENTE|");
  if (i < 0) return null;
  const [, max, scope, remaining, code, ...name] = msg.slice(i).split("|");
  return {
    max: Number(max) || 0,
    scope: scope === "combined" ? "combined" : "per_product",
    remaining: Number(remaining) || 0,
    code: code || "",
    name: name.join("|") || "",
  };
}

export function purchaseLimitCustomerMessage(hit: PurchaseLimitHit): string {
  const un = (n: number) => `${n} unidade${n === 1 ? "" : "s"}`;
  const produto = hit.name ? `*${hit.name}*${hit.code ? ` (${hit.code})` : ""}` : hit.code ? `*${hit.code}*` : "este produto";
  const regra = hit.scope === "combined"
    ? `Os produtos desta promoção, como o ${produto}, têm limite de *${un(hit.max)} no total por cliente*.`
    : `O produto ${produto} tem limite de *${un(hit.max)} por cliente* nesta promoção.`;
  const final = hit.remaining > 0
    ? `Você ainda pode pedir mais *${un(hit.remaining)}*. 😉`
    : `Você já atingiu esse limite, então não consegui adicionar mais ao seu pedido. 😉`;
  return `Oi! 💛 ${regra}\n\n${final}`;
}
