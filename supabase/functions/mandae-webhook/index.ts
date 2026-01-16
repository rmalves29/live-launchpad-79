import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mandae-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const bodyText = await req.text();
    
    console.log("[mandae-webhook] Recebido webhook da Mandae");
    console.log("[mandae-webhook] Body:", bodyText.substring(0, 500));
    
    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error("[mandae-webhook] Erro ao parsear JSON:", e);
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A Mandae envia diferentes formatos de webhook
    // Formato típico: { trackingCode, status, orderId, events: [...] }
    const trackingCode = payload.trackingCode || payload.tracking_code || payload.codigoRastreio;
    const mandaeOrderId = payload.orderId || payload.order_id || payload.pedidoId;
    const status = payload.status || payload.situacao;
    const events = payload.events || payload.eventos || [];

    console.log(`[mandae-webhook] Tracking: ${trackingCode}, OrderId: ${mandaeOrderId}, Status: ${status}`);

    if (!trackingCode && !mandaeOrderId) {
      console.log("[mandae-webhook] Payload sem dados identificáveis, logando para análise");
      
      await supabase.from("webhook_logs").insert({
        webhook_type: "mandae_webhook_unknown",
        status_code: 200,
        payload: payload,
        response: "Payload não identificável"
      });
      
      return new Response(
        JSON.stringify({ success: true, message: "Webhook received but no identifiable data" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar pedido pelo mandae_id (armazenado como mandae_XXXXX em melhor_envio_shipment_id)
    let order = null;
    let orderError = null;

    if (mandaeOrderId) {
      const result = await supabase
        .from("orders")
        .select("id, tenant_id, melhor_envio_tracking_code, customer_phone, customer_name")
        .eq("melhor_envio_shipment_id", `mandae_${mandaeOrderId}`)
        .single();
      
      order = result.data;
      orderError = result.error;
    }

    // Se não encontrou pelo ID, tentar pelo tracking code
    if (!order && trackingCode) {
      const result = await supabase
        .from("orders")
        .select("id, tenant_id, melhor_envio_tracking_code, customer_phone, customer_name")
        .eq("melhor_envio_tracking_code", trackingCode)
        .single();
      
      order = result.data;
      orderError = result.error;
    }

    if (!order) {
      console.log(`[mandae-webhook] Pedido não encontrado para mandae_id: ${mandaeOrderId} ou tracking: ${trackingCode}`);
      
      await supabase.from("webhook_logs").insert({
        webhook_type: "mandae_webhook",
        status_code: 200,
        payload: { mandae_order_id: mandaeOrderId, tracking_code: trackingCode, order_not_found: true },
        response: JSON.stringify(payload)
      });
      
      return new Response(
        JSON.stringify({ success: true, message: "Order not found but webhook received" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atualizar tracking code se disponível e diferente
    const updates: Record<string, any> = {};
    
    if (trackingCode && trackingCode !== order.melhor_envio_tracking_code) {
      updates.melhor_envio_tracking_code = trackingCode;
      console.log(`[mandae-webhook] Atualizando tracking code: ${trackingCode}`);
    }

    // Atualizar pedido se houver mudanças
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order.id);

      if (updateError) {
        console.error("[mandae-webhook] Erro ao atualizar pedido:", updateError);
      }
    }

    // Logar webhook recebido
    await supabase.from("webhook_logs").insert({
      tenant_id: order.tenant_id,
      webhook_type: `mandae_${status || 'update'}`,
      status_code: 200,
      payload: {
        order_id: order.id,
        mandae_order_id: mandaeOrderId,
        tracking_code: trackingCode,
        status: status,
        events_count: events.length
      },
      response: JSON.stringify(payload).substring(0, 5000)
    });

    // Se recebemos um tracking code novo, enviar notificação via WhatsApp
    if (trackingCode && trackingCode !== order.melhor_envio_tracking_code) {
      console.log(`[mandae-webhook] Enviando notificação de tracking para pedido ${order.id}`);
      
      try {
        const trackingResponse = await fetch(`${supabaseUrl}/functions/v1/zapi-send-tracking`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            order_id: order.id,
            tenant_id: order.tenant_id,
            tracking_code: trackingCode,
            tracking_url: `https://rastreae.com.br/${trackingCode}`
          })
        });

        const trackingResult = await trackingResponse.json();
        console.log(`[mandae-webhook] Resposta do zapi-send-tracking:`, trackingResult);
      } catch (trackingError) {
        console.error("[mandae-webhook] Erro ao enviar tracking:", trackingError);
      }
    }

    console.log(`[mandae-webhook] Webhook processado com sucesso para pedido ${order.id}`);

    return new Response(
      JSON.stringify({ success: true, order_id: order.id, tracking_code: trackingCode }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[mandae-webhook] Erro geral:", error);
    
    await supabase.from("webhook_logs").insert({
      webhook_type: "mandae_webhook_error",
      status_code: 500,
      error_message: error.message,
      payload: null
    });
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
