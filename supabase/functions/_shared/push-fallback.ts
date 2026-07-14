// Helper compartilhado: dispara push antes do envio WhatsApp.
// Se um push for entregue com sucesso, o WhatsApp deve ser suprimido.
// Espelha as variáveis usadas nos templates de WhatsApp da tabela `whatsapp_templates`.

type TemplateType =
  | "cart_item_added"
  | "cart_item_removed"
  | "order_paid"
  | "tracking_code"
  | "waitlist"
  | "blocked_customer"
  | "instagram_signup";

export interface TryPushArgs {
  tenantId: string;
  templateType: TemplateType;
  customerPhone?: string | null;
  customerId?: number | null;
  vars?: Record<string, string | number | undefined | null>;
}

export async function tryPushBeforeWhatsApp(args: TryPushArgs): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return false;

    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(args.vars || {})) {
      vars[k] = v == null ? "" : String(v);
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/push-dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        tenant_id: args.tenantId,
        template_type: args.templateType,
        customer_phone: args.customerPhone || null,
        customer_id: args.customerId ?? null,
        vars,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return Boolean(data?.sent_push);
  } catch (e) {
    console.warn("[push-fallback] erro invocando push-dispatch:", (e as any)?.message || e);
    return false;
  }
}
