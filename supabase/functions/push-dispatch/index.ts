// Decides whether to send a push notification for an automatic event.
// Called from the frontend/triggers BEFORE the WhatsApp send.
// Returns { sent_push: boolean } — caller sends WhatsApp when false.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "../_shared/web-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TemplateType =
  | "cart_item_added"
  | "cart_item_removed"
  | "order_paid"
  | "tracking_code"
  | "waitlist"
  | "blocked_customer"
  | "instagram_signup";

function interpolate(tpl: string, vars: Record<string, string>): string {
  // suporta {var} (padrão push) e {{var}} (padrão WhatsApp) para alinhamento com templates existentes
  return String(tpl || "")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ""))
    .replace(/\{\s*(\w+)\s*\}/g, (_, k) => (vars[k] ?? ""));
}

function normalizeDigits(v?: string | null) { return String(v || "").replace(/\D/g, ""); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { tenant_id, template_type, customer_phone, customer_id, vars } = body as {
      tenant_id: string; template_type: TemplateType; customer_phone?: string; customer_id?: number | null; vars?: Record<string, string>;
    };
    if (!tenant_id || !template_type) {
      return new Response(JSON.stringify({ success: false, sent_push: false, error: "params" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1) template enabled?
    const { data: tpl } = await supabase.from("push_templates").select("*").eq("tenant_id", tenant_id).eq("type", template_type).maybeSingle();
    if (!tpl || !(tpl as any).is_enabled) {
      return new Response(JSON.stringify({ success: true, sent_push: false, reason: "template_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) find active subs for this customer
    const digits = normalizeDigits(customer_phone);
    let query = supabase.from("push_subscriptions").select("*").eq("tenant_id", tenant_id).eq("is_active", true);
    if (customer_id) query = query.eq("customer_id", customer_id);
    else if (digits) query = query.ilike("phone", `%${digits.slice(-10)}%`);
    else return new Response(JSON.stringify({ success: true, sent_push: false, reason: "no_target" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: subs } = await query;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ success: true, sent_push: false, reason: "no_subscription" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const title = interpolate((tpl as any).title, vars || {});
    const bodyText = interpolate((tpl as any).body, vars || {});

    let successCount = 0;
    for (const s of subs as any[]) {
      // insert log first to get id for tracking
      const { data: logRow } = await supabase.from("push_notifications_log").insert({
        tenant_id, subscription_id: s.id, customer_id: s.customer_id, template_type,
        title, body: bodyText, channel: "push", status: "pending",
      }).select("id").single();

      const payload = {
        title, body: bodyText, image: (tpl as any).image_url || undefined,
        url: (tpl as any).click_url || "/", log_id: logRow?.id,
      };
      const res = await sendWebPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      if (res.ok) {
        successCount++;
        if (logRow) await supabase.from("push_notifications_log").update({ status: "sent" }).eq("id", logRow.id);
      } else {
        if (logRow) await supabase.from("push_notifications_log").update({ status: "failed", error: res.error }).eq("id", logRow.id);
        if (res.gone) await supabase.from("push_subscriptions").update({ is_active: false }).eq("id", s.id);
      }
    }
    return new Response(JSON.stringify({ success: true, sent_push: successCount > 0, count: successCount }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, sent_push: false, error: e?.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
