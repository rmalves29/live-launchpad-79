import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "../_shared/web-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { tenant_id, title, body, image_url, click_url, audience } = await req.json();
    if (!tenant_id || !title || !body) {
      return new Response(JSON.stringify({ success: false, error: "faltam campos" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aud = (audience === "paid" || audience === "unpaid") ? audience : "all";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let subs: any[] = [];
    const { data: baseSubs } = await supabase.from("push_subscriptions").select("*").eq("tenant_id", tenant_id).eq("is_active", true);
    subs = baseSubs || [];

    if (aud !== "all") {
      const custIds = subs.map((s) => s.customer_id).filter((x) => x != null);
      if (custIds.length === 0) subs = [];
      else {
        const { data: orders } = await supabase.from("orders").select("customer_id, is_paid").in("customer_id", custIds).eq("tenant_id", tenant_id);
        const paidSet = new Set<number>();
        const anySet = new Set<number>();
        for (const o of orders || []) {
          anySet.add((o as any).customer_id);
          if ((o as any).is_paid) paidSet.add((o as any).customer_id);
        }
        subs = subs.filter((s) => {
          const cid = s.customer_id;
          if (cid == null) return false;
          if (aud === "paid") return paidSet.has(cid);
          if (aud === "unpaid") return anySet.has(cid) && !paidSet.has(cid);
          return true;
        });
      }
    }

    const { data: campaign } = await supabase.from("push_campaigns").insert({
      tenant_id, title, body, image_url: image_url || null, click_url: click_url || null,
      audience: aud, total_targets: subs.length,
    }).select("id").single();
    const campaignId = campaign?.id;

    let sent = 0, failed = 0;
    for (const s of subs) {
      const { data: logRow } = await supabase.from("push_notifications_log").insert({
        tenant_id, subscription_id: s.id, customer_id: s.customer_id, campaign_id: campaignId,
        title, body, channel: "push", status: "pending",
      }).select("id").single();
      const payload = { title, body, image: image_url || undefined, url: click_url || "/", log_id: logRow?.id };
      const res = await sendWebPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      if (res.ok) {
        sent++;
        if (logRow) await supabase.from("push_notifications_log").update({ status: "sent" }).eq("id", logRow.id);
      } else {
        failed++;
        if (logRow) await supabase.from("push_notifications_log").update({ status: "failed", error: res.error }).eq("id", logRow.id);
        if (res.gone) await supabase.from("push_subscriptions").update({ is_active: false }).eq("id", s.id);
      }
    }
    if (campaignId) {
      await supabase.from("push_campaigns").update({ total_sent: sent, total_failed: failed }).eq("id", campaignId);
    }
    return new Response(JSON.stringify({ success: true, campaign_id: campaignId, targets: subs.length, sent, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
