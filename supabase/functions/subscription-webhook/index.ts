import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PlanConfig {
  id: string;
  name: string;
  days: number;
}

const PLAN_CONFIGS: Record<string, PlanConfig> = {
  basic: { id: "basic", name: "Basic", days: 30 },
  pro: { id: "pro", name: "Pro", days: 185 },
  enterprise: { id: "enterprise", name: "Enterprise", days: 365 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error("[subscription-webhook] Missing Supabase config");
    return new Response(
      JSON.stringify({ error: "Server config error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    console.log("[subscription-webhook] Received webhook:", JSON.stringify(body));

    // Log webhook received
    await sb.from("webhook_logs").insert({
      webhook_type: "subscription_webhook_received",
      status_code: 200,
      payload: body,
      response: "Webhook received",
    });

    const { type, data, topic, resource } = body;

    // Usar token global da OrderZap
    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");

    if (!mpAccessToken) {
      console.error("[subscription-webhook] MP token not configured");
      return new Response(
        JSON.stringify({ error: "Payment config missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Payment notification (IPN style)
    if (topic === "payment" && resource) {
      const paymentId = typeof resource === "string" ? resource : null;
      if (paymentId) {
        await processSubscriptionPayment(sb, paymentId, mpAccessToken);
      }
    }

    // Payment notification (Webhook style)
    if (type === "payment" && data?.id) {
      await processSubscriptionPayment(sb, String(data.id), mpAccessToken);
    }

    // Merchant order notification
    if (topic === "merchant_order" && resource) {
      await processMerchantOrder(sb, resource, mpAccessToken);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[subscription-webhook] Error:", error);

    await sb.from("webhook_logs").insert({
      webhook_type: "subscription_webhook_error",
      status_code: 500,
      error_message: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processSubscriptionPayment(
  sb: ReturnType<typeof createClient>,
  paymentId: string,
  mpAccessToken: string
) {
  console.log(`[subscription-webhook] Processing payment: ${paymentId}`);

  try {
    // Fetch payment details from Mercado Pago
    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      }
    );

    if (!paymentRes.ok) {
      console.error(`[subscription-webhook] Failed to fetch payment ${paymentId}: ${paymentRes.status}`);
      return;
    }

    const payment = await paymentRes.json();
    console.log(`[subscription-webhook] Payment status: ${payment.status}, external_reference: ${payment.external_reference}`);

    // Only process approved payments
    if (payment.status !== "approved") {
      console.log(`[subscription-webhook] Payment ${paymentId} not approved (status: ${payment.status})`);
      return;
    }

    // Parse external_reference
    // Format: "subscription:TENANT_ID;plan:PLAN_ID;days:DAYS"
    const externalRef = payment.external_reference || "";
    
    if (!externalRef.startsWith("subscription:")) {
      console.log(`[subscription-webhook] Not a subscription payment: ${externalRef}`);
      return;
    }

    const tenantId = parseValue(externalRef, "subscription");
    const planId = parseValue(externalRef, "plan");
    const daysFromRef = parseInt(parseValue(externalRef, "days") || "0", 10);

    if (!tenantId || !planId) {
      console.error(`[subscription-webhook] Invalid external_reference: ${externalRef}`);
      return;
    }

    // Get plan config (fallback to days from reference)
    const planConfig = PLAN_CONFIGS[planId];
    const planDays = planConfig?.days || daysFromRef || 30;
    const planName = planConfig?.name || planId;

    // Calculate new subscription end date
    const now = new Date();
    const newEndDate = new Date(now.getTime() + planDays * 24 * 60 * 60 * 1000);

    console.log(`[subscription-webhook] Renewing tenant ${tenantId} with plan ${planName} for ${planDays} days until ${newEndDate.toISOString()}`);

    // Update tenant subscription
    const { error: updateError } = await sb
      .from("tenants")
      .update({
        subscription_ends_at: newEndDate.toISOString(),
        plan_type: planId,
        is_blocked: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (updateError) {
      console.error(`[subscription-webhook] Error updating tenant ${tenantId}:`, updateError);
      return;
    }

    console.log(`[subscription-webhook] Tenant ${tenantId} subscription renewed successfully!`);

    // Log success
    await sb.from("webhook_logs").insert({
      webhook_type: "subscription_renewed",
      status_code: 200,
      tenant_id: tenantId,
      payload: {
        payment_id: paymentId,
        plan_id: planId,
        plan_name: planName,
        plan_days: planDays,
        new_end_date: newEndDate.toISOString(),
        amount: payment.transaction_amount,
      },
      response: `Subscription renewed until ${newEndDate.toISOString()}`,
    });

    // Log in audit_logs for tracking
    await sb.from("audit_logs").insert({
      entity: "tenant",
      entity_id: tenantId,
      action: "subscription_renewed",
      tenant_id: tenantId,
      meta: {
        plan_id: planId,
        plan_name: planName,
        plan_days: planDays,
        payment_id: paymentId,
        amount: payment.transaction_amount,
        new_end_date: newEndDate.toISOString(),
      },
    });
  } catch (error) {
    console.error(`[subscription-webhook] Error processing payment ${paymentId}:`, error);
  }
}

async function processMerchantOrder(
  sb: ReturnType<typeof createClient>,
  resourceUrl: string,
  mpAccessToken: string
) {
  try {
    const orderRes = await fetch(resourceUrl, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });

    if (!orderRes.ok) {
      console.error(`[subscription-webhook] Failed to fetch merchant order: ${orderRes.status}`);
      return;
    }

    const merchantOrder = await orderRes.json();
    console.log(`[subscription-webhook] Merchant order status: ${merchantOrder.order_status}`);

    // Check if order is fully paid
    if (merchantOrder.order_status === "paid" && merchantOrder.payments) {
      for (const payment of merchantOrder.payments) {
        if (payment.status === "approved") {
          await processSubscriptionPayment(sb, String(payment.id), mpAccessToken);
        }
      }
    }
  } catch (error) {
    console.error("[subscription-webhook] Error processing merchant order:", error);
  }
}

function parseValue(externalRef: string, key: string): string | null {
  // Format: "key:value;key:value"
  const regex = new RegExp(`${key}:([^;]+)`);
  const match = externalRef.match(regex);
  return match ? match[1] : null;
}
