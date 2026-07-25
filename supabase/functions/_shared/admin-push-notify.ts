// Envia push para os admins inscritos no tenant OrderZap.
// Usado para alertar sobre novos cadastros / upgrades de plano no Fluxo de Envio.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "./web-push.ts";

export const ORDERZAP_TENANT_ID = "d5671cfb-9c42-4c44-8f94-0a19a39473d8";

export interface AdminNotifyArgs {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function notifyOrderZapAdmins(args: AdminNotifyArgs): Promise<{ sent: number; failed: number }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return { sent: 0, failed: 0 };

    const sb = createClient(supabaseUrl, serviceKey);
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("*")
      .eq("tenant_id", ORDERZAP_TENANT_ID)
      .eq("is_active", true);

    if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    for (const s of subs as any[]) {
      const { data: logRow } = await sb.from("push_notifications_log").insert({
        tenant_id: ORDERZAP_TENANT_ID,
        subscription_id: s.id,
        customer_id: s.customer_id,
        template_type: "admin_alert",
        title: args.title,
        body: args.body,
        channel: "push",
        status: "pending",
      }).select("id").single();

      const payload = {
        title: args.title,
        body: args.body,
        url: args.url || "/empresas",
        tag: args.tag,
        log_id: logRow?.id,
      };
      const res = await sendWebPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      if (res.ok) {
        sent++;
        if (logRow) await sb.from("push_notifications_log").update({ status: "sent" }).eq("id", logRow.id);
      } else {
        failed++;
        if (logRow) await sb.from("push_notifications_log").update({ status: "failed", error: res.error }).eq("id", logRow.id);
        if (res.gone) await sb.from("push_subscriptions").update({ is_active: false }).eq("id", s.id);
      }
    }
    return { sent, failed };
  } catch (e) {
    console.error("[admin-push-notify] error:", (e as any)?.message || e);
    return { sent: 0, failed: 0 };
  }
}
