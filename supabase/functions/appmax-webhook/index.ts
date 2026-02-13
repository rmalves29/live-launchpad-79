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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id");
    const body = await req.json();

    console.log("[appmax-webhook] Received:", JSON.stringify(body).slice(0, 500));
    console.log("[appmax-webhook] Tenant ID from query:", tenantId);

    // Log webhook
    await sb.from("webhook_logs").insert({
      webhook_type: "appmax_webhook",
      status_code: 200,
      payload: body,
      tenant_id: tenantId,
    });

    // App Max pode enviar diferentes formatos de notificação
    // Comum: { event, data: { order_id, status, ... } }
    // Ou diretamente: { order_id, status, payment_status, ... }
    const event = body.event || body.type || "";
    const eventData = body.data || body;
    const appmaxOrderId = eventData.order_id || eventData.id || body.order_id || body.id;
    const status = eventData.status || eventData.payment_status || body.status || body.payment_status || "";

    console.log(`[appmax-webhook] Event: ${event}, Status: ${status}, Appmax Order ID: ${appmaxOrderId}`);

    // Verificar se é um evento de pagamento aprovado
    const isPaid = status === "approved" || status === "paid" || status === "captured" ||
                   event === "payment.approved" || event === "order.paid" || event === "payment.captured";

    if (!isPaid) {
      console.log("[appmax-webhook] Not a payment confirmation event, skipping");
      return new Response(JSON.stringify({ status: "ok", message: "Event logged but not a payment" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tentar encontrar pedidos locais correspondentes
    let foundOrders: any[] = [];

    // 1) Buscar por appmax order ID no payment_link ou observation
    if (appmaxOrderId) {
      const appmaxIdStr = String(appmaxOrderId);
      
      // Tentar pelo payment_link (checkout URL contém o order ID)
      const { data: byLink } = await sb
        .from("orders")
        .select("id, is_paid, tenant_id")
        .ilike("payment_link", `%${appmaxIdStr}%`)
        .eq("is_paid", false);

      if (byLink && byLink.length > 0) {
        foundOrders = byLink;
        console.log(`[appmax-webhook] Found ${byLink.length} order(s) by payment_link`);
      }

      // Fallback: buscar na observation
      if (foundOrders.length === 0) {
        const { data: byObs } = await sb
          .from("orders")
          .select("id, is_paid, tenant_id")
          .ilike("observation", `%order_id: ${appmaxIdStr}%`)
          .eq("is_paid", false);

        if (byObs && byObs.length > 0) {
          foundOrders = byObs;
          console.log(`[appmax-webhook] Found ${byObs.length} order(s) by observation`);
        }
      }
    }

    // 2) Se veio external_reference no formato padrão
    const externalRef = eventData.external_reference || body.external_reference || "";
    if (foundOrders.length === 0 && externalRef) {
      const match = externalRef.match(/orders:([0-9,]+)/);
      if (match) {
        const orderIds = match[1].split(",").map(Number).filter((n: number) => !isNaN(n) && n > 0);
        if (orderIds.length > 0) {
          const { data } = await sb
            .from("orders")
            .select("id, is_paid, tenant_id")
            .in("id", orderIds)
            .eq("is_paid", false);
          if (data && data.length > 0) {
            foundOrders = data;
            console.log(`[appmax-webhook] Found ${data.length} order(s) by external_reference`);
          }
        }
      }
    }

    if (foundOrders.length === 0) {
      console.log("[appmax-webhook] No unpaid orders found for this notification");
      await sb.from("webhook_logs").insert({
        webhook_type: "appmax_no_orders_found",
        status_code: 200,
        payload: { appmax_order_id: appmaxOrderId, status, external_reference: externalRef },
        tenant_id: tenantId,
      });
      return new Response(JSON.stringify({ status: "ok", message: "No orders to update" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Marcar pedidos como pagos
    for (const order of foundOrders) {
      if (order.is_paid) continue;

      const { error } = await sb
        .from("orders")
        .update({ is_paid: true })
        .eq("id", order.id);

      if (error) {
        console.error(`[appmax-webhook] Error updating order ${order.id}:`, error);
        continue;
      }

      console.log(`[appmax-webhook] ✅ Order ${order.id} marked as paid`);

      await sb.from("webhook_logs").insert({
        webhook_type: "appmax_payment_success",
        status_code: 200,
        payload: { order_id: order.id, appmax_order_id: appmaxOrderId },
        tenant_id: order.tenant_id || tenantId,
      });

      // Sync com Bling se configurado
      await syncOrderWithBling(sb, order.id, order.tenant_id || tenantId);
    }

    return new Response(
      JSON.stringify({ status: "ok", orders_updated: foundOrders.map((o: any) => o.id) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[appmax-webhook] Error:", e);

    await sb.from("webhook_logs").insert({
      webhook_type: "appmax_webhook_error",
      status_code: 500,
      error_message: e instanceof Error ? e.message : String(e),
    });

    // Return 200 to prevent retries
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function syncOrderWithBling(sb: any, orderId: number, tenantId: string | null) {
  if (!tenantId) return;

  try {
    const { data: blingIntegration } = await sb
      .from("integration_bling")
      .select("is_active, sync_orders, access_token")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!blingIntegration?.is_active || !blingIntegration?.sync_orders || !blingIntegration?.access_token) return;

    console.log(`[appmax-webhook] Syncing order ${orderId} with Bling ERP...`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const response = await fetch(`${supabaseUrl}/functions/v1/bling-sync-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ action: "send_order", order_id: orderId, tenant_id: tenantId }),
    });

    const result = await response.json();
    if (response.ok && result.success) {
      console.log(`[appmax-webhook] ✅ Order ${orderId} synced with Bling`);
    } else {
      console.error(`[appmax-webhook] Bling sync failed:`, result);
    }
  } catch (e) {
    console.error(`[appmax-webhook] Error syncing with Bling:`, e);
  }
}
