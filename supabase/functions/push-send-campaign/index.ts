import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "../_shared/web-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Normalize phone to digits only for cross-source matching
const digits = (v: any) => String(v ?? "").replace(/\D+/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const {
      tenant_id,
      title,
      body,
      image_url,
      click_url,
      audience,
      states,          // string[] of UFs (e.g. ["MG","SP"])
      date_from,       // ISO date "YYYY-MM-DD" (inclusive, Brasília)
      date_to,         // ISO date "YYYY-MM-DD" (inclusive, Brasília)
    } = await req.json();

    if (!tenant_id || !title || !body) {
      return new Response(JSON.stringify({ success: false, error: "faltam campos" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const allowedAud = new Set(["all", "paid", "unpaid", "buyers"]);
    const aud = allowedAud.has(audience) ? audience : "all";
    const ufList: string[] = Array.isArray(states) ? states.map((s: any) => String(s).toUpperCase().trim()).filter(Boolean) : [];
    const needsDate = aud === "paid" || aud === "unpaid";
    const startISO = needsDate && date_from ? `${date_from}T00:00:00-03:00` : null;
    const endISO = needsDate && date_to ? `${date_to}T23:59:59.999-03:00` : null;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1) Load subscriptions (active)
    const { data: baseSubs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true);
    let subs = baseSubs || [];

    // 2) Optional state filter — needs customer lookup by phone
    if (ufList.length > 0 || aud !== "all") {
      const subPhones = Array.from(new Set(subs.map((s) => digits(s.phone)).filter((p) => p.length >= 8)));

      // Map: phone -> customer row (for state) using tenant-scoped customers
      let phoneToState = new Map<string, string>();
      if (ufList.length > 0 && subPhones.length > 0) {
        // Fetch customers batched
        const CHUNK = 200;
        for (let i = 0; i < subPhones.length; i += CHUNK) {
          const chunk = subPhones.slice(i, i + CHUNK);
          const { data: custs } = await supabase
            .from("customers")
            .select("phone,state")
            .eq("tenant_id", tenant_id)
            .in("phone", chunk);
          for (const c of custs || []) {
            const p = digits((c as any).phone);
            if (p) phoneToState.set(p, String((c as any).state || "").toUpperCase());
          }
        }
        subs = subs.filter((s) => {
          const uf = phoneToState.get(digits(s.phone)) || "";
          return ufList.includes(uf);
        });
      }

      // Audience filter using orders (matched by phone within tenant)
      if (aud !== "all" && subs.length > 0) {
        const activePhones = Array.from(new Set(subs.map((s) => digits(s.phone)).filter((p) => p.length >= 8)));
        // Load relevant orders (chunked)
        const paidByPhone = new Set<string>();
        const anyByPhone = new Set<string>();
        const paidInWindowByPhone = new Set<string>();
        const unpaidInWindowByPhone = new Set<string>();
        const CHUNK = 200;
        for (let i = 0; i < activePhones.length; i += CHUNK) {
          const chunk = activePhones.slice(i, i + CHUNK);
          let q = supabase
            .from("orders")
            .select("customer_phone,is_paid,created_at,is_cancelled")
            .eq("tenant_id", tenant_id)
            .in("customer_phone", chunk);
          const { data: ords } = await q;
          for (const o of ords || []) {
            const p = digits((o as any).customer_phone);
            if (!p) continue;
            if ((o as any).is_cancelled) continue;
            anyByPhone.add(p);
            if ((o as any).is_paid) paidByPhone.add(p);
            const created = (o as any).created_at as string;
            const inWindow = (!startISO || created >= startISO) && (!endISO || created <= endISO);
            if (inWindow) {
              if ((o as any).is_paid) paidInWindowByPhone.add(p);
              else unpaidInWindowByPhone.add(p);
            }
          }
        }
        subs = subs.filter((s) => {
          const p = digits(s.phone);
          if (!p) return false;
          if (aud === "buyers") return paidByPhone.has(p);
          if (aud === "paid") return needsDate && (startISO || endISO) ? paidInWindowByPhone.has(p) : paidByPhone.has(p);
          if (aud === "unpaid") {
            const inSet = needsDate && (startISO || endISO) ? unpaidInWindowByPhone : anyByPhone;
            return inSet.has(p) && !paidByPhone.has(p);
          }
          return true;
        });
      }
    }

    // 3) Register campaign
    const { data: campaign } = await supabase.from("push_campaigns").insert({
      tenant_id, title, body, image_url: image_url || null, click_url: click_url || null,
      audience: aud, total_targets: subs.length,
    }).select("id").single();
    const campaignId = campaign?.id;

    // 4) Dispatch
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
