import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error("[mp-webhook] Missing Supabase config");
    return new Response(JSON.stringify({ error: "Server config error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const tenantIdFromQuery = url.searchParams.get("tenant_id");

    const body = await req.json();
    console.log("[mp-webhook] Received webhook:", JSON.stringify({ tenant_id: tenantIdFromQuery, body }));

    // Log webhook received
    await sb.from("webhook_logs").insert({
      webhook_type: "mercadopago_webhook",
      status_code: 200,
      tenant_id: tenantIdFromQuery,
      payload: body,
      response: "Webhook received",
    });

    // Resolver token do MP por tenant (fallback: MP_ACCESS_TOKEN global)
    let mpAccessToken: string | null = null;
    if (tenantIdFromQuery) {
      const { data: mpIntegration } = await sb
        .from("integration_mp")
        .select("access_token, is_active")
        .eq("tenant_id", tenantIdFromQuery)
        .maybeSingle();

      mpAccessToken = mpIntegration?.is_active ? mpIntegration?.access_token : null;
    }

    if (!mpAccessToken) {
      mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN") || null;
    }

    if (!mpAccessToken) {
      console.error("[mp-webhook] No MP access token found for tenant:", tenantIdFromQuery);
      return new Response(JSON.stringify({ error: "No MP token" }), {
        status: 200, // Return 200 to MP so it doesn't retry endlessly
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle different webhook types
    const { type, data, topic, resource, action } = body;

    // === IPN-style: topic=payment, resource=paymentId ===
    if (topic === "payment" && resource) {
      const paymentId = String(resource).replace(/\D/g, "");
      if (paymentId) {
        console.log(`[mp-webhook] IPN payment notification: ${paymentId}`);
        await processPayment(sb, paymentId, mpAccessToken, tenantIdFromQuery);
      }
    }

    // === Webhook V2 style: type=payment, data.id=paymentId ===
    if (type === "payment" && data?.id) {
      const paymentId = String(data.id);
      console.log(`[mp-webhook] Webhook V2 payment notification: ${paymentId}, action: ${action}`);
      await processPayment(sb, paymentId, mpAccessToken, tenantIdFromQuery);
    }

    // === Merchant order notification ===
    if (topic === "merchant_order" && resource) {
      console.log("[mp-webhook] Merchant order notification:", resource);
      await processMerchantOrder(sb, String(resource), mpAccessToken, tenantIdFromQuery);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[mp-webhook] Error processing webhook:", error);

    await sb.from("webhook_logs").insert({
      webhook_type: "mercadopago_webhook_error",
      status_code: 500,
      error_message: error instanceof Error ? error.message : String(error),
    });

    // Return 200 to prevent MP from retrying on our errors
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processPayment(sb: any, paymentId: string, mpAccessToken: string, tenantIdHint: string | null) {
  console.log(`[mp-webhook] Processing payment: ${paymentId}`);

  try {
    // Fetch payment details from Mercado Pago
    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    });

    if (!paymentRes.ok) {
      const errText = await paymentRes.text();
      console.error(`[mp-webhook] Failed to fetch payment ${paymentId}: ${paymentRes.status} - ${errText.substring(0, 200)}`);
      
      // Log the failure
      await sb.from("webhook_logs").insert({
        webhook_type: "mercadopago_payment_fetch_error",
        status_code: paymentRes.status,
        tenant_id: tenantIdHint,
        error_message: `Failed to fetch payment ${paymentId}: ${paymentRes.status}`,
        payload: { payment_id: paymentId, response_preview: errText.substring(0, 500) },
      });
      return;
    }

    const payment = await paymentRes.json();
    console.log(`[mp-webhook] Payment ${paymentId}: status=${payment.status}, external_reference=${payment.external_reference}, preference_id=${payment.preference_id}`);

    // Only process approved payments
    if (payment.status !== "approved") {
      console.log(`[mp-webhook] Payment ${paymentId} not approved (status: ${payment.status}), skipping`);
      
      // Log non-approved payment for debugging
      await sb.from("webhook_logs").insert({
        webhook_type: "mercadopago_payment_not_approved",
        status_code: 200,
        tenant_id: tenantIdHint,
        payload: { payment_id: paymentId, status: payment.status, external_reference: payment.external_reference },
      });
      return;
    }

    // Parse external_reference to get order IDs
    const externalRef = payment.external_reference || "";
    const orderIds = parseOrderIds(externalRef);
    const tenantId = parseTenantId(externalRef) || tenantIdHint;

    console.log(`[mp-webhook] Payment ${paymentId} APPROVED. external_ref="${externalRef}", parsed orderIds=[${orderIds}], tenantId=${tenantId}`);

    if (orderIds.length > 0) {
      // Mark orders as paid using external_reference
      for (const orderId of orderIds) {
        await markOrderAsPaid(sb, orderId, tenantId, paymentId);
      }
      return;
    }

    // Fallback: Try to find order by preference_id in payment_link
    const preferenceId = payment.preference_id;
    if (preferenceId) {
      console.log(`[mp-webhook] No orderIds from external_ref, trying preference_id: ${preferenceId}`);
      const { data: orders } = await sb
        .from("orders")
        .select("id, is_paid, tenant_id")
        .ilike("payment_link", `%${preferenceId}%`);

      if (orders && orders.length > 0) {
        console.log(`[mp-webhook] Found ${orders.length} order(s) by preference_id`);
        for (const order of orders) {
          await markOrderAsPaid(sb, order.id, order.tenant_id || tenantId, paymentId);
        }
      } else {
        console.log(`[mp-webhook] No orders found for preference_id: ${preferenceId}`);
        
        await sb.from("webhook_logs").insert({
          webhook_type: "mercadopago_payment_no_order",
          status_code: 200,
          tenant_id: tenantId,
          payload: { payment_id: paymentId, preference_id: preferenceId, external_reference: externalRef },
        });
      }
    } else {
      console.log(`[mp-webhook] Payment ${paymentId} approved but no way to find matching order`);
    }
  } catch (error) {
    console.error(`[mp-webhook] Error processing payment ${paymentId}:`, error);
    
    await sb.from("webhook_logs").insert({
      webhook_type: "mercadopago_payment_process_error",
      status_code: 500,
      tenant_id: tenantIdHint,
      error_message: error instanceof Error ? error.message : String(error),
      payload: { payment_id: paymentId },
    });
  }
}

async function processMerchantOrder(sb: any, resourceUrl: string, mpAccessToken: string, tenantIdHint: string | null) {
  try {
    const orderRes = await fetch(resourceUrl, {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error(`[mp-webhook] Failed to fetch merchant order: ${orderRes.status} - ${errText.substring(0, 200)}`);
      return;
    }

    const merchantOrder = await orderRes.json();
    console.log(`[mp-webhook] Merchant order: status=${merchantOrder.order_status}, payments=${merchantOrder.payments?.length || 0}`);

    // Process ALL payments in the merchant order, not just when order_status is "paid"
    // This is the key fix: sometimes order_status is "payment_required" but individual payments are "approved"
    if (merchantOrder.payments && merchantOrder.payments.length > 0) {
      for (const payment of merchantOrder.payments) {
        console.log(`[mp-webhook] Merchant order payment: id=${payment.id}, status=${payment.status}, amount=${payment.transaction_amount}`);
        
        if (payment.status === "approved") {
          await processPayment(sb, String(payment.id), mpAccessToken, tenantIdHint);
        }
      }
    } else {
      console.log(`[mp-webhook] Merchant order has no payments yet (status: ${merchantOrder.order_status})`);
    }
  } catch (error) {
    console.error("[mp-webhook] Error processing merchant order:", error);
  }
}

async function markOrderAsPaid(sb: any, orderId: number, tenantId: string | null, paymentId: string) {
  console.log(`[mp-webhook] Marking order ${orderId} as paid (payment: ${paymentId})`);

  // Check if already paid
  const { data: existingOrder } = await sb
    .from("orders")
    .select("id, is_paid, tenant_id, customer_phone, total_amount")
    .eq("id", orderId)
    .single();

  if (!existingOrder) {
    console.log(`[mp-webhook] Order ${orderId} not found`);
    return;
  }

  if (existingOrder.is_paid) {
    console.log(`[mp-webhook] Order ${orderId} already marked as paid, skipping`);
    return;
  }

  const orderTenantId = existingOrder.tenant_id || tenantId;

  // Update order to paid
  const { error: updateError } = await sb
    .from("orders")
    .update({ is_paid: true })
    .eq("id", orderId);

  if (updateError) {
    console.error(`[mp-webhook] Error updating order ${orderId}:`, updateError);
    
    await sb.from("webhook_logs").insert({
      webhook_type: "mercadopago_update_error",
      status_code: 500,
      tenant_id: orderTenantId,
      error_message: updateError.message,
      payload: { order_id: orderId, payment_id: paymentId },
    });
    return;
  }

  console.log(`[mp-webhook] ✅ Order ${orderId} marked as paid successfully`);

  // Log success
  await sb.from("webhook_logs").insert({
    webhook_type: "mercadopago_payment_success",
    status_code: 200,
    tenant_id: orderTenantId,
    payload: { order_id: orderId, payment_id: paymentId },
    response: `Order ${orderId} marked as paid`,
  });

  // Note: WhatsApp notification is sent by the database trigger (process_paid_order)

  // Sync with Bling ERP if configured
  await syncOrderWithBling(sb, orderId, orderTenantId);
}

async function syncOrderWithBling(sb: any, orderId: number, tenantId: string | null) {
  if (!tenantId) return;

  try {
    const { data: blingIntegration } = await sb
      .from("integration_bling")
      .select("is_active, sync_orders, access_token")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!blingIntegration?.is_active || !blingIntegration?.sync_orders || !blingIntegration?.access_token) {
      return;
    }

    console.log(`[mp-webhook] Syncing order ${orderId} with Bling ERP...`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const response = await fetch(`${supabaseUrl}/functions/v1/bling-sync-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        action: "send_order",
        order_id: orderId,
        tenant_id: tenantId,
      }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log(`[mp-webhook] ✅ Order ${orderId} synced with Bling`);
    } else {
      console.error(`[mp-webhook] Bling sync failed for order ${orderId}:`, result);
    }
  } catch (error) {
    console.error(`[mp-webhook] Error syncing order ${orderId} with Bling:`, error);
  }
}

function parseOrderIds(externalRef: string): number[] {
  const match = externalRef.match(/orders:([0-9,]+)/);
  if (!match) return [];
  
  return match[1]
    .split(",")
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id));
}

function parseTenantId(externalRef: string): string | null {
  const match = externalRef.match(/tenant:([a-f0-9-]+)/i);
  return match ? match[1] : null;
}
