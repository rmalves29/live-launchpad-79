import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseCodeForTenant(code?: string | null): { tenant_id?: string; plan_id?: string } {
  if (!code) return {};
  // orderzap-sub-<TENANT_UUID>-<PLAN>
  const m = code.match(/^orderzap-sub-([0-9a-f-]{36})-(pro|enterprise)$/i);
  if (!m) return {};
  return { tenant_id: m[1], plan_id: m[2] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const raw = await req.text();
  const secret = Deno.env.get("PAGARME_WEBHOOK_SECRET_ORDERZAP");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validação HMAC (header X-Hub-Signature: sha256=...)
  if (secret) {
    const sig = req.headers.get("x-hub-signature") || req.headers.get("X-Hub-Signature") || "";
    const provided = sig.replace(/^sha256=/, "").trim();
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    if (!provided || provided !== expected) {
      console.warn("[pagarme-sub-webhook] HMAC inválido");
      await supabase.from("webhook_logs").insert({
        source: "pagarme-subscription",
        event_type: "invalid_signature",
        payload: { headers: Object.fromEntries(req.headers) },
        success: false,
      } as any);
      return json({ error: "invalid signature" }, 401);
    }
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const type: string = event?.type || "";
  const data = event?.data || {};
  console.log("[pagarme-sub-webhook] event:", type);

  try {
    // Resolver subscription_id e tenant_id
    let subscriptionId: string | undefined;
    let charge: any = null;
    let subscription: any = null;

    if (type.startsWith("subscription.")) {
      subscription = data;
      subscriptionId = data?.id;
    } else if (type.startsWith("charge.") || type.startsWith("invoice.")) {
      charge = data;
      subscription = data?.subscription || null;
      subscriptionId = data?.subscription_id || data?.subscription?.id;
    }

    const code = subscription?.code || charge?.subscription?.code;
    const metadata = subscription?.metadata || charge?.metadata || {};
    const parsedCode = parseCodeForTenant(code);
    let tenantId: string | undefined = metadata?.tenant_id || parsedCode.tenant_id;
    let planId: string | undefined = metadata?.plan_id || parsedCode.plan_id;
    let intervalMonths = Number(metadata?.interval_months) || (planId === "enterprise" ? 12 : 6);

    // Buscar registro local
    let local: any = null;
    if (subscriptionId) {
      const { data: row } = await supabase
        .from("subscription_recurrences")
        .select("*")
        .eq("pagarme_subscription_id", subscriptionId)
        .maybeSingle();
      local = row;
      if (local) {
        tenantId = tenantId || local.tenant_id;
        planId = planId || local.plan_id;
        intervalMonths = local.interval_months || intervalMonths;
      }
    }

    if (!tenantId) {
      await supabase.from("webhook_logs").insert({
        source: "pagarme-subscription",
        event_type: `unmatched:${type}`,
        payload: event,
        success: false,
      } as any);
      return json({ ok: true, warning: "tenant not resolved" });
    }

    const now = new Date();

    if (type === "charge.paid" || type === "invoice.paid" || type === "subscription.charged") {
      // idempotência por charge id
      if (charge?.id && local?.last_charge_id === charge.id) {
        return json({ ok: true, idempotent: true });
      }

      // estende subscription_ends_at
      const { data: tenant } = await supabase
        .from("tenants")
        .select("subscription_ends_at")
        .eq("id", tenantId)
        .maybeSingle();

      const base = tenant?.subscription_ends_at && new Date(tenant.subscription_ends_at) > now
        ? new Date(tenant.subscription_ends_at)
        : now;
      const extended = new Date(base);
      extended.setMonth(extended.getMonth() + intervalMonths);

      await supabase
        .from("tenants")
        .update({ subscription_ends_at: extended.toISOString(), plan_type: planId })
        .eq("id", tenantId);

      const nextBilling = subscription?.next_billing_at || subscription?.current_cycle?.end_at || null;

      await supabase
        .from("subscription_recurrences")
        .update({
          status: "active",
          last_charge_at: now.toISOString(),
          last_charge_status: "paid",
          last_charge_id: charge?.id || null,
          current_period_end: nextBilling || extended.toISOString(),
        })
        .eq("pagarme_subscription_id", subscriptionId!);
    } else if (type === "charge.payment_failed" || type === "subscription.charge_failed") {
      await supabase
        .from("subscription_recurrences")
        .update({
          status: "past_due",
          last_charge_at: now.toISOString(),
          last_charge_status: "failed",
          last_charge_id: charge?.id || null,
        })
        .eq("pagarme_subscription_id", subscriptionId!);
    } else if (type === "subscription.canceled" || type === "subscription.deleted") {
      await supabase
        .from("subscription_recurrences")
        .update({
          status: "canceled",
          canceled_at: now.toISOString(),
        })
        .eq("pagarme_subscription_id", subscriptionId!);
    } else if (type === "subscription.created" || type === "subscription.updated") {
      const nextBilling = subscription?.next_billing_at || subscription?.current_cycle?.end_at || null;
      await supabase
        .from("subscription_recurrences")
        .update({
          status: subscription?.status || "active",
          current_period_end: nextBilling,
        })
        .eq("pagarme_subscription_id", subscriptionId!);
    }

    await supabase.from("webhook_logs").insert({
      source: "pagarme-subscription",
      event_type: type,
      tenant_id: tenantId,
      payload: event,
      success: true,
    } as any);

    return json({ ok: true });
  } catch (err) {
    console.error("[pagarme-sub-webhook] erro:", err);
    await supabase.from("webhook_logs").insert({
      source: "pagarme-subscription",
      event_type: `error:${type}`,
      payload: { error: String(err), event },
      success: false,
    } as any);
    return json({ ok: false, error: String(err) });
  }
});
