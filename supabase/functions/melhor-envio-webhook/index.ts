import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-me-signature",
};

// Verifica assinatura HMAC-SHA256 do Melhor Envio
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    
    return signature === computedSignature;
  } catch (error) {
    console.error("[melhor-envio-webhook] Erro ao verificar assinatura:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-me-signature") || "";
    
    console.log("[melhor-envio-webhook] Recebido webhook do Melhor Envio");
    console.log("[melhor-envio-webhook] Body:", bodyText.substring(0, 500));
    
    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error("[melhor-envio-webhook] Erro ao parsear JSON:", e);
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { event, data } = payload;
    
    if (!event || !data) {
      console.error("[melhor-envio-webhook] Payload inválido - faltando event ou data");
      return new Response(
        JSON.stringify({ error: "Invalid payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[melhor-envio-webhook] Evento: ${event}, Shipment ID: ${data.id}, Status: ${data.status}`);

    // Buscar pedido pelo melhor_envio_shipment_id
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, tenant_id, melhor_envio_tracking_code, customer_phone")
      .eq("melhor_envio_shipment_id", data.id)
      .single();

    if (orderError || !order) {
      console.log(`[melhor-envio-webhook] Pedido não encontrado para shipment ${data.id}`);
      
      // Logar mesmo assim para debug
      await supabase.from("webhook_logs").insert({
        webhook_type: "melhor_envio_webhook",
        status_code: 200,
        payload: { event, shipment_id: data.id, order_not_found: true },
        response: JSON.stringify(data)
      });
      
      return new Response(
        JSON.stringify({ success: true, message: "Order not found but webhook received" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar assinatura se temos webhook_secret configurado
    const { data: integration } = await supabase
      .from("shipping_integrations")
      .select("webhook_secret")
      .eq("tenant_id", order.tenant_id)
      .eq("provider", "melhor_envio")
      .single();

    if (integration?.webhook_secret && signature) {
      const isValid = await verifySignature(bodyText, signature, integration.webhook_secret);
      if (!isValid) {
        console.warn("[melhor-envio-webhook] Assinatura inválida");
        // Não bloquear, apenas logar
      }
    }

    // Atualizar tracking code se disponível
    const updates: Record<string, any> = {};
    
    if (data.tracking && data.tracking !== order.melhor_envio_tracking_code) {
      updates.melhor_envio_tracking_code = data.tracking;
      console.log(`[melhor-envio-webhook] Atualizando tracking code: ${data.tracking}`);
    }

    // Atualizar pedido se houver mudanças
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order.id);

      if (updateError) {
        console.error("[melhor-envio-webhook] Erro ao atualizar pedido:", updateError);
      }
    }

    // Logar webhook recebido
    await supabase.from("webhook_logs").insert({
      tenant_id: order.tenant_id,
      webhook_type: `melhor_envio_${event}`,
      status_code: 200,
      payload: {
        event,
        order_id: order.id,
        shipment_id: data.id,
        tracking: data.tracking,
        status: data.status
      },
      response: JSON.stringify(data).substring(0, 5000)
    });

    // Se o evento for de postagem (order.posted), enviar notificação de tracking
    if (event === "order.posted" && data.tracking) {
      console.log(`[melhor-envio-webhook] Enviando notificação de tracking para pedido ${order.id}`);
      
      try {
        // Chamar edge function de envio de tracking
        const trackingResponse = await fetch(`${supabaseUrl}/functions/v1/zapi-send-tracking`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            order_id: order.id,
            tenant_id: order.tenant_id,
            tracking_code: data.tracking,
            tracking_url: data.tracking_url
          })
        });

        const trackingResult = await trackingResponse.json();
        console.log(`[melhor-envio-webhook] Resposta do zapi-send-tracking:`, trackingResult);
      } catch (trackingError) {
        console.error("[melhor-envio-webhook] Erro ao enviar tracking:", trackingError);
      }
    }

    console.log(`[melhor-envio-webhook] Webhook processado com sucesso para pedido ${order.id}`);

    return new Response(
      JSON.stringify({ success: true, order_id: order.id, event }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[melhor-envio-webhook] Erro geral:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
