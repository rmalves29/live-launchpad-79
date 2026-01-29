import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server config missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id");
    const body = await req.json();

    console.log("[pagarme-webhook] Received webhook:", JSON.stringify(body, null, 2));
    console.log("[pagarme-webhook] Tenant ID from query:", tenantId);

    // Log webhook recebido
    await sb.from("webhook_logs").insert({
      webhook_type: "pagarme_webhook",
      status_code: 200,
      payload: body,
      tenant_id: tenantId,
    });

    // Pagar.me envia webhooks em diferentes formatos dependendo do evento
    // Formato padrão: { id, type, data: { ... } }
    // Formato alternativo: { event, ... } ou diretamente os dados do charge/order
    const eventType = body.type || body.event || 
      (body.current_status === 'paid' ? 'charge.paid' : null) ||
      (body.status === 'paid' ? 'charge.paid' : null);
    const eventData = body.data || body;

    console.log("[pagarme-webhook] Detected event type:", eventType);
    console.log("[pagarme-webhook] Event data keys:", Object.keys(eventData));

    if (!eventType) {
      console.log("[pagarme-webhook] Could not determine event type, checking for paid status directly");
      
      // Tentar identificar pagamento pelo status diretamente
      const isPaid = body.status === 'paid' || 
                     body.current_status === 'paid' ||
                     eventData?.status === 'paid' ||
                     eventData?.current_status === 'paid';
      
      if (!isPaid) {
        console.log("[pagarme-webhook] Not a payment confirmation event");
        return new Response(JSON.stringify({ status: "ok", message: "Event logged but not a payment" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Processar eventos de pagamento - aceitar múltiplos formatos
    const isPaymentEvent = eventType === "charge.paid" || 
                           eventType === "order.paid" ||
                           eventType === "transaction.paid" ||
                           eventType === "payment.paid" ||
                           body.status === 'paid' ||
                           body.current_status === 'paid';

    if (isPaymentEvent) {
      console.log("[pagarme-webhook] Processing payment event:", eventType);

      // Extrair external_reference de múltiplos locais possíveis
      const metadata = eventData.metadata || 
                       eventData.charge?.metadata || 
                       body.metadata ||
                       body.charge?.metadata ||
                       body.order?.metadata ||
                       {};
      
      // external_reference pode vir em diferentes campos
      const externalReference = metadata.external_reference || 
                                 metadata.externalReference ||
                                 eventData.external_reference ||
                                 eventData.code ||
                                 body.external_reference ||
                                 body.code ||
                                 "";

      console.log("[pagarme-webhook] External reference found:", externalReference);
      console.log("[pagarme-webhook] Metadata:", JSON.stringify(metadata));

      // Parse external_reference: "tenant:UUID;orders:1,2,3"
      const orderIds = parseOrderIds(externalReference);
      const parsedTenantId = parseTenantId(externalReference) || tenantId;

      console.log("[pagarme-webhook] Parsed tenant_id:", parsedTenantId);
      console.log("[pagarme-webhook] Parsed order_ids:", orderIds);

      if (orderIds.length === 0) {
        console.log("[pagarme-webhook] No order IDs found in external_reference, trying to find by metadata");
        
        // Log mais detalhado para debug
        await sb.from("webhook_logs").insert({
          webhook_type: "pagarme_no_orders_found",
          status_code: 200,
          payload: { 
            external_reference: externalReference, 
            metadata,
            full_body_keys: Object.keys(body),
            event_data_keys: Object.keys(eventData)
          },
          tenant_id: parsedTenantId,
        });
        
        return new Response(JSON.stringify({ status: "ok", message: "No orders to update - check external_reference format" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[pagarme-webhook] Updating orders:", orderIds);

      // Marcar pedidos como pagos
      for (const orderId of orderIds) {
        await markOrderAsPaid(sb, orderId, parsedTenantId, body.id);
      }

      return new Response(
        JSON.stringify({ status: "ok", orders_updated: orderIds }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Outros eventos (refund, failed, etc)
    console.log("[pagarme-webhook] Event not processed:", eventType);
    return new Response(
      JSON.stringify({ status: "ok", message: "Event logged but not processed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[pagarme-webhook] Error:", e);

    await sb.from("webhook_logs").insert({
      webhook_type: "pagarme_webhook_error",
      status_code: 500,
      error_message: e instanceof Error ? e.message : String(e),
    });

    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseOrderIds(externalRef: string): number[] {
  // Format: "tenant:UUID;orders:1,2,3"
  const match = externalRef.match(/orders:([0-9,]+)/);
  if (!match) return [];
  return match[1].split(",").map(Number).filter((n) => !isNaN(n) && n > 0);
}

function parseTenantId(externalRef: string): string | null {
  // Format: "tenant:UUID;orders:1,2,3"
  const match = externalRef.match(/tenant:([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

async function markOrderAsPaid(
  sb: ReturnType<typeof createClient>,
  orderId: number,
  tenantId: string | null,
  webhookEventId: string
) {
  try {
    console.log(`[pagarme-webhook] Marking order ${orderId} as paid`);

    // Verificar se o pedido existe e buscar informações
    const { data: existingOrder } = await sb
      .from("orders")
      .select("id, is_paid, tenant_id, customer_phone, total_amount")
      .eq("id", orderId)
      .single();

    if (!existingOrder) {
      console.log(`[pagarme-webhook] Order ${orderId} not found`);
      return;
    }

    if (existingOrder.is_paid) {
      console.log(`[pagarme-webhook] Order ${orderId} already marked as paid`);
      return;
    }

    // Usar tenant do pedido se não vier no webhook
    const orderTenantId = existingOrder.tenant_id || tenantId;

    // Marcar como pago - o TRIGGER do banco de dados vai disparar zapi-send-paid-order automaticamente
    const { error } = await sb
      .from("orders")
      .update({ is_paid: true })
      .eq("id", orderId);

    if (error) {
      console.error(`[pagarme-webhook] Error updating order ${orderId}:`, error);
      return;
    }

    console.log(`[pagarme-webhook] Order ${orderId} marked as paid successfully`);

    // Log sucesso
    await sb.from("webhook_logs").insert({
      webhook_type: "pagarme_payment_success",
      status_code: 200,
      payload: { order_id: orderId, payment_id: webhookEventId },
      tenant_id: orderTenantId,
      response: `Order ${orderId} marked as paid`,
    });

    // Nota: A notificação WhatsApp é enviada pelo trigger do banco de dados (process_paid_order)

    // Sync com Bling se configurado
    await syncOrderWithBling(sb, orderId, orderTenantId);
  } catch (e) {
    console.error(`[pagarme-webhook] Exception updating order ${orderId}:`, e);
  }
}

async function syncOrderWithBling(
  sb: ReturnType<typeof createClient>,
  orderId: number,
  tenantId: string | null
) {
  if (!tenantId) {
    console.log(`[pagarme-webhook] Cannot sync with Bling: no tenant_id`);
    return;
  }

  try {
    const { data: blingIntegration } = await sb
      .from("integration_bling")
      .select("is_active, sync_orders, access_token")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!blingIntegration?.is_active || !blingIntegration?.sync_orders || !blingIntegration?.access_token) {
      console.log(`[pagarme-webhook] Bling ERP not configured or sync_orders disabled for tenant ${tenantId}`);
      return;
    }

    console.log(`[pagarme-webhook] Syncing order ${orderId} with Bling ERP...`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const response = await fetch(`${supabaseUrl}/functions/v1/bling-sync-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "send_order",
        order_id: orderId,
        tenant_id: tenantId,
      }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log(`[pagarme-webhook] Order ${orderId} synced with Bling ERP successfully`);
    } else {
      console.error(`[pagarme-webhook] Bling sync failed for order ${orderId}:`, result);
    }
  } catch (e) {
    console.error(`[pagarme-webhook] Error syncing order ${orderId} with Bling:`, e);
  }
}
