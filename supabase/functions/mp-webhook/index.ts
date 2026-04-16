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
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ──────────────────────────────────────────────────────────────────
// Payment processing
// ──────────────────────────────────────────────────────────────────

async function processPayment(sb: any, paymentId: string, mpAccessToken: string, tenantIdHint: string | null) {
  console.log(`[mp-webhook] Processing payment: ${paymentId}`);

  try {
    const payment = await fetchPaymentFromMP(paymentId, mpAccessToken);
    if (!payment) {
      await sb.from("webhook_logs").insert({
        webhook_type: "mercadopago_payment_fetch_error",
        status_code: 0,
        tenant_id: tenantIdHint,
        error_message: `Failed to fetch payment ${paymentId}`,
        payload: { payment_id: paymentId },
      });
      return;
    }

    console.log(`[mp-webhook] Payment ${paymentId}: status=${payment.status}, external_reference=${payment.external_reference}, preference_id=${payment.preference_id}`);

    // ── Cancelled / Refunded ──
    const isCancelled = ["refunded", "cancelled", "charged_back", "rejected"].includes(payment.status);

    if (isCancelled) {
      console.log(`[mp-webhook] Payment ${paymentId} is ${payment.status}, evaluating cancellation`);
      await handleCancelledPayment(sb, payment, paymentId, mpAccessToken, tenantIdHint);
      return;
    }

    // ── Approved ──
    if (payment.status !== "approved") {
      console.log(`[mp-webhook] Payment ${paymentId} not approved (status: ${payment.status}), skipping`);
      await sb.from("webhook_logs").insert({
        webhook_type: "mercadopago_payment_not_approved",
        status_code: 200,
        tenant_id: tenantIdHint,
        payload: { payment_id: paymentId, status: payment.status, external_reference: payment.external_reference },
      });
      return;
    }

    const externalRef = payment.external_reference || "";
    const orderIds = parseOrderIds(externalRef);
    const tenantId = parseTenantId(externalRef) || tenantIdHint;

    console.log(`[mp-webhook] Payment ${paymentId} APPROVED. external_ref="${externalRef}", parsed orderIds=[${orderIds}], tenantId=${tenantId}`);

    if (orderIds.length > 0) {
      for (const orderId of orderIds) {
        await markOrderAsPaid(sb, orderId, tenantId, paymentId);
      }
      return;
    }

    // Fallback: preference_id
    const preferenceId = payment.preference_id;
    if (preferenceId) {
      console.log(`[mp-webhook] No orderIds from external_ref, trying preference_id: ${preferenceId}`);
      const { data: orders } = await sb
        .from("orders")
        .select("id, is_paid, tenant_id")
        .ilike("payment_link", `%${preferenceId}%`);

      if (orders && orders.length > 0) {
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

// ──────────────────────────────────────────────────────────────────
// Handle cancelled / refunded payment
//
// KEY FIX: Before cancelling an order, check if there is ANOTHER
// approved payment for the same external_reference. If yes, the
// cancelled payment is just an expired secondary attempt (e.g. PIX
// QR code that was regenerated) and should be ignored.
// ──────────────────────────────────────────────────────────────────

async function handleCancelledPayment(
  sb: any,
  payment: any,
  paymentId: string,
  mpAccessToken: string,
  tenantIdHint: string | null,
) {
  const externalRef = payment.external_reference || "";
  const orderIds = parseOrderIds(externalRef);
  const tenantId = parseTenantId(externalRef) || tenantIdHint;

  let ordersToCheck: any[] = [];

  if (orderIds.length > 0) {
    const { data } = await sb.from("orders").select("id, is_paid, is_cancelled, tenant_id").in("id", orderIds);
    if (data) ordersToCheck = data;
  }

  // Fallback by preference_id
  if (ordersToCheck.length === 0 && payment.preference_id) {
    const { data } = await sb.from("orders").select("id, is_paid, is_cancelled, tenant_id")
      .ilike("payment_link", `%${payment.preference_id}%`);
    if (data && data.length > 0) ordersToCheck = data;
  }

  for (const order of ordersToCheck) {
    if (order.is_cancelled) continue;

    // Skip orders that were never paid (e.g. expired PIX QR code)
    if (!order.is_paid) {
      console.log(`[mp-webhook] Order ${order.id} was never paid (is_paid=false), skipping cancellation for ${payment.status}. Likely an expired PIX.`);
      await sb.from("webhook_logs").insert({
        webhook_type: "mercadopago_skip_cancel_unpaid",
        status_code: 200,
        tenant_id: order.tenant_id || tenantId,
        payload: { order_id: order.id, payment_id: paymentId, payment_status: payment.status },
        response: `Skipped: order ${order.id} was never paid`,
      });
      continue;
    }

    // ★ CRITICAL CHECK: Search MP for another approved payment with the same external_reference.
    // If one exists, this cancellation is just a secondary attempt expiring — DO NOT cancel the order.
    const hasOtherApproved = await hasAnotherApprovedPayment(externalRef, paymentId, mpAccessToken);

    if (hasOtherApproved) {
      console.log(`[mp-webhook] ⚠️ Order ${order.id}: ignoring ${payment.status} for payment ${paymentId} because another approved payment exists for the same external_reference.`);
      await sb.from("webhook_logs").insert({
        webhook_type: "mercadopago_skip_cancel_other_approved",
        status_code: 200,
        tenant_id: order.tenant_id || tenantId,
        payload: { order_id: order.id, payment_id: paymentId, payment_status: payment.status, external_reference: externalRef },
        response: `Skipped cancellation: another approved payment exists`,
      });
      continue;
    }

    // No other approved payment → proceed with cancellation
    await markOrderAsCancelled(sb, order.id, order.tenant_id || tenantId, paymentId, payment.status);
  }
}

// ──────────────────────────────────────────────────────────────────
// Check if another APPROVED payment exists for the same external_reference
// ──────────────────────────────────────────────────────────────────

async function hasAnotherApprovedPayment(
  externalReference: string,
  excludePaymentId: string,
  mpAccessToken: string,
): Promise<boolean> {
  if (!externalReference) return false;

  try {
    const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&status=approved&limit=5`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });

    if (!res.ok) {
      console.error(`[mp-webhook] Failed to search payments by external_reference: ${res.status}`);
      // On API error, be conservative and DON'T cancel
      return true;
    }

    const data = await res.json();
    const results = data.results || [];

    // Check if any approved payment is different from the one being cancelled
    const otherApproved = results.some((p: any) => String(p.id) !== excludePaymentId && p.status === "approved");

    console.log(`[mp-webhook] Search for approved payments with ref="${externalReference}": found ${results.length} results, otherApproved=${otherApproved}`);
    return otherApproved;
  } catch (error) {
    console.error(`[mp-webhook] Error searching payments:`, error);
    // On error, be conservative and DON'T cancel
    return true;
  }
}

// ──────────────────────────────────────────────────────────────────
// Fetch payment details from MP
// ──────────────────────────────────────────────────────────────────

async function fetchPaymentFromMP(paymentId: string, mpAccessToken: string): Promise<any | null> {
  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpAccessToken}` },
  });

  if (!paymentRes.ok) {
    const errText = await paymentRes.text();
    console.error(`[mp-webhook] Failed to fetch payment ${paymentId}: ${paymentRes.status} - ${errText.substring(0, 200)}`);
    return null;
  }

  return await paymentRes.json();
}

// ──────────────────────────────────────────────────────────────────
// Merchant order processing
// ──────────────────────────────────────────────────────────────────

async function processMerchantOrder(sb: any, resourceUrl: string, mpAccessToken: string, tenantIdHint: string | null) {
  try {
    const orderRes = await fetch(resourceUrl, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error(`[mp-webhook] Failed to fetch merchant order: ${orderRes.status} - ${errText.substring(0, 200)}`);
      return;
    }

    const merchantOrder = await orderRes.json();
    console.log(`[mp-webhook] Merchant order: status=${merchantOrder.order_status}, payments=${merchantOrder.payments?.length || 0}`);

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

// ──────────────────────────────────────────────────────────────────
// Mark order as paid
// ──────────────────────────────────────────────────────────────────

async function markOrderAsPaid(sb: any, orderId: number, tenantId: string | null, paymentId: string) {
  console.log(`[mp-webhook] Marking order ${orderId} as paid (payment: ${paymentId})`);

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

  await sb.from("webhook_logs").insert({
    webhook_type: "mercadopago_payment_success",
    status_code: 200,
    tenant_id: orderTenantId,
    payload: { order_id: orderId, payment_id: paymentId },
    response: `Order ${orderId} marked as paid`,
  });

  await syncOrderWithBling(sb, orderId, orderTenantId);
}

// ──────────────────────────────────────────────────────────────────
// Bling ERP sync
// ──────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────
// Mark order as cancelled
// ──────────────────────────────────────────────────────────────────

async function markOrderAsCancelled(sb: any, orderId: number, tenantId: string | null, paymentId: string, reason: string) {
  console.log(`[mp-webhook] Cancelling order ${orderId} (reason: ${reason})`);

  const { data: existingOrder } = await sb
    .from("orders")
    .select("id, is_paid, is_cancelled, tenant_id")
    .eq("id", orderId)
    .single();

  if (!existingOrder || existingOrder.is_cancelled) {
    console.log(`[mp-webhook] Order ${orderId} not found or already cancelled`);
    return;
  }

  const orderTenantId = existingOrder.tenant_id || tenantId;

  const { error } = await sb
    .from("orders")
    .update({ is_paid: false, is_cancelled: true })
    .eq("id", orderId);

  if (error) {
    console.error(`[mp-webhook] Error cancelling order ${orderId}:`, error);
    return;
  }

  console.log(`[mp-webhook] ✅ Order ${orderId} cancelled and unmarked as paid`);

  await sb.from("audit_logs").insert({
    entity: "order",
    entity_id: String(orderId),
    action: "auto_cancel_payment_refunded",
    tenant_id: orderTenantId,
    meta: { reason, payment_id: paymentId, previous_is_paid: existingOrder.is_paid },
  });

  await sb.from("webhook_logs").insert({
    webhook_type: "mercadopago_payment_cancelled",
    status_code: 200,
    tenant_id: orderTenantId,
    payload: { order_id: orderId, payment_id: paymentId, reason },
    response: `Order ${orderId} cancelled`,
  });
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function parseOrderIds(externalRef: string): number[] {
  const match = externalRef.match(/orders:([0-9,]+)/);
  if (!match) return [];
  return match[1].split(",").map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
}

function parseTenantId(externalRef: string): string | null {
  const match = externalRef.match(/tenant:([a-f0-9-]+)/i);
  return match ? match[1] : null;
}
