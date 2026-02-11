import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Handle different webhook types
    const { type, data, topic, resource } = body;

    // Payment notification (IPN style)
    if (topic === "payment" && resource) {
      const paymentId = typeof resource === "string" ? resource : null;
      if (paymentId) {
        await processPayment(sb, paymentId, mpAccessToken);
      }
    }

    // Payment notification (Webhook style)
    if (type === "payment" && data?.id) {
      await processPayment(sb, String(data.id), mpAccessToken);
    }

    // Merchant order notification
    if (topic === "merchant_order" && resource) {
      console.log("[mp-webhook] Merchant order notification, checking payments...");
      await processMerchantOrder(sb, resource, mpAccessToken);
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
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processPayment(sb: any, paymentId: string, mpAccessToken: string | null) {
  console.log(`[mp-webhook] Processing payment: ${paymentId}`);

  if (!mpAccessToken) {
    console.error("[mp-webhook] Mercado Pago token não encontrado (tenant/global)");
    return;
  }

  try {
    // Fetch payment details from Mercado Pago
    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    });

    if (!paymentRes.ok) {
      console.error(`[mp-webhook] Failed to fetch payment ${paymentId}: ${paymentRes.status}`);
      return;
    }

    const payment = await paymentRes.json();
    console.log(`[mp-webhook] Payment status: ${payment.status}, external_reference: ${payment.external_reference}`);

    // Only process approved payments
    if (payment.status !== "approved") {
      console.log(`[mp-webhook] Payment ${paymentId} not approved (status: ${payment.status})`);
      return;
    }

    // Extract payment method info
    const paymentMethodId = payment.payment_method_id || payment.payment_type_id || null;
    const installments = payment.installments || 1;
    // Map MP payment methods: credit_card, debit_card, account_money, pix, bolbradesco, etc.
    let paymentMethod = paymentMethodId;
    if (paymentMethodId === "account_money") paymentMethod = "pix";
    if (paymentMethodId === "bolbradesco" || paymentMethodId === "pec") paymentMethod = "boleto";
    console.log(`[mp-webhook] Payment method: ${paymentMethod}, installments: ${installments}`);

    // Parse external_reference to get order IDs
    // Format: "tenant:UUID;orders:1,2,3"
    const externalRef = payment.external_reference || "";
    const orderIds = parseOrderIds(externalRef);
    const tenantId = parseTenantId(externalRef);

    if (orderIds.length === 0) {
      // Try to find order by preference_id in payment_link
      const preferenceId = payment.preference_id;
      if (preferenceId) {
        const { data: orders } = await sb
          .from("orders")
          .select("id, is_paid, tenant_id")
          .ilike("payment_link", `%${preferenceId}%`);

        if (orders && orders.length > 0) {
          for (const order of orders) {
            await markOrderAsPaid(sb, order.id, order.tenant_id, paymentId, paymentMethod, installments);
          }
        }
      }
      return;
    }

    // Mark orders as paid
    for (const orderId of orderIds) {
      await markOrderAsPaid(sb, orderId, tenantId, paymentId, paymentMethod, installments);
    }
  } catch (error) {
    console.error(`[mp-webhook] Error processing payment ${paymentId}:`, error);
  }
}

async function processMerchantOrder(sb: any, resourceUrl: string, mpAccessToken: string | null) {
  if (!mpAccessToken) {
    console.error("[mp-webhook] Mercado Pago token não encontrado (tenant/global)");
    return;
  }

  try {
    const orderRes = await fetch(resourceUrl, {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    });

    if (!orderRes.ok) {
      console.error(`[mp-webhook] Failed to fetch merchant order: ${orderRes.status}`);
      return;
    }

    const merchantOrder = await orderRes.json();
    console.log(`[mp-webhook] Merchant order status: ${merchantOrder.order_status}`);

    // Check if order is fully paid
    if (merchantOrder.order_status === "paid" && merchantOrder.payments) {
      for (const payment of merchantOrder.payments) {
        if (payment.status === "approved") {
          await processPayment(sb, String(payment.id), mpAccessToken);
        }
      }
    }
  } catch (error) {
    console.error("[mp-webhook] Error processing merchant order:", error);
  }
}

async function markOrderAsPaid(sb: any, orderId: number, tenantId: string | null, paymentId: string, paymentMethod?: string | null, installments?: number) {
  console.log(`[mp-webhook] Marking order ${orderId} as paid`);

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
    console.log(`[mp-webhook] Order ${orderId} already marked as paid`);
    return;
  }

  const orderTenantId = existingOrder.tenant_id || tenantId;

  // Update order to paid with payment method info
  const updateData: any = { is_paid: true };
  if (paymentMethod) updateData.payment_method = paymentMethod;
  if (installments && installments > 0) updateData.payment_installments = installments;

  const { error: updateError } = await sb
    .from("orders")
    .update(updateData)
    .eq("id", orderId);

  if (updateError) {
    console.error(`[mp-webhook] Error updating order ${orderId}:`, updateError);
    return;
  }

  console.log(`[mp-webhook] Order ${orderId} marked as paid successfully`);

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
  if (!tenantId) {
    console.log(`[mp-webhook] Cannot sync with Bling: no tenant_id`);
    return;
  }

  try {
    // Check if Bling integration is active
    const { data: blingIntegration } = await sb
      .from("integration_bling")
      .select("is_active, sync_orders, access_token")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!blingIntegration?.is_active || !blingIntegration?.sync_orders || !blingIntegration?.access_token) {
      console.log(`[mp-webhook] Bling ERP not configured or sync_orders disabled for tenant ${tenantId}`);
      return;
    }

    console.log(`[mp-webhook] Syncing order ${orderId} with Bling ERP...`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Call Bling sync edge function
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
      console.log(`[mp-webhook] Order ${orderId} synced with Bling ERP successfully`);
    } else {
      console.error(`[mp-webhook] Bling sync failed for order ${orderId}:`, result);
    }
  } catch (error) {
    console.error(`[mp-webhook] Error syncing order ${orderId} with Bling:`, error);
  }
}

function parseOrderIds(externalRef: string): number[] {
  // Format: "tenant:UUID;orders:1,2,3"
  const match = externalRef.match(/orders:([0-9,]+)/);
  if (!match) return [];
  
  return match[1]
    .split(",")
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id));
}

function parseTenantId(externalRef: string): string | null {
  // Format: "tenant:UUID;orders:1,2,3"
  const match = externalRef.match(/tenant:([a-f0-9-]+)/i);
  return match ? match[1] : null;
}
