// Mensagens de WhatsApp dos pedidos da Loja da Live (source = 'live_shop').
// O lojista escolhe, na página Loja da Live > WhatsApp, quais mensagens saem e com qual texto.
// Sem configuração para o tipo = comportamento padrão (template normal da loja).
// deno-lint-ignore-file no-explicit-any

export type LiveTemplateOverride = {
  /** true quando o pedido é da Loja da Live e existe configuração própria para este tipo */
  isLive: boolean;
  /** true = o lojista desligou esta mensagem para pedidos da live */
  disabled: boolean;
  /** texto próprio da live (null = usa o template normal da loja) */
  content: string | null;
};

const NONE: LiveTemplateOverride = { isLive: false, disabled: false, content: null };

export async function liveTemplateOverride(
  supabase: any,
  tenantId: string,
  orderId: number | string | null | undefined,
  type: "ITEM_ADDED" | "PAID_ORDER" | "TRACKING",
): Promise<LiveTemplateOverride> {
  try {
    if (!orderId || !tenantId) return NONE;
    const { data: order } = await supabase
      .from("orders")
      .select("source")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (order?.source !== "live_shop") return NONE;

    const { data: cfg } = await supabase
      .from("live_shop_whatsapp")
      .select("is_active, content")
      .eq("tenant_id", tenantId)
      .eq("message_type", type)
      .maybeSingle();
    if (!cfg) return { isLive: true, disabled: false, content: null };

    const content = typeof cfg.content === "string" && cfg.content.trim() ? cfg.content : null;
    return { isLive: true, disabled: cfg.is_active === false, content };
  } catch (e: any) {
    console.warn("[live-whatsapp] override lookup failed:", e?.message || e);
    return NONE; // nunca bloqueia o envio normal por falha na consulta
  }
}
