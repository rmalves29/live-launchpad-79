import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  antiBlockDelayLive,
  logAntiBlockDelay,
  addMessageVariation,
  simulateTyping,
} from "../_shared/anti-block-delay.ts";
import {
  sendText as evoSendText,
  sendPresenceAvailable,
  sendPresenceComposing,
  calcTypingDuration,
} from "../_shared/evolution-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_id, tenant_id, tracking_code, shipped_at } = await req.json();
    const isDbTriggerCall = !req.headers.get("authorization");

    console.log("[TRACKING] Iniciando envio:", { order_id, tenant_id, tracking_code });

    if (!order_id || !tenant_id || !tracking_code) {
      return new Response(
        JSON.stringify({ success: false, error: "Parametros obrigatorios: order_id, tenant_id, tracking_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, customer_phone, customer_name, total_amount, unique_order_id")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "Pedido nao encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: integration, error: integrationError } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token, evolution_instance_name, provider")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError || !integration) {
      await supabase.from("whatsapp_messages").insert({
        tenant_id,
        phone: order.customer_phone,
        message: "FALHA ao enviar rastreio " + tracking_code + " - Integracao nao configurada",
        type: "system_log",
        order_id: order.id,
        created_at: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({ success: false, error: "Integracao WhatsApp nao configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = integration.provider || "zapi";

    if (provider === "evolution" && !integration.evolution_instance_name) {
      return new Response(
        JSON.stringify({ success: false, error: "evolution_instance_name nao configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (provider === "zapi" && (!integration.zapi_instance_id || !integration.zapi_token)) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais Z-API incompletas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: template } = await supabase
      .from("whatsapp_templates")
      .select("content")
      .eq("tenant_id", tenant_id)
      .eq("type", "TRACKING")
      .maybeSingle();

    const defaultTemplate = "Seu pedido *#{{order_id}}* foi enviado!\n\nCodigo de Rastreio: *{{tracking_code}}*\nData de Envio: {{shipped_at}}\n\nRastreie em: https://www.melhorrastreio.com.br/rastreio/{{tracking_code}}";

    let messageContent = template?.content || defaultTemplate;

    const shippedDate = shipped_at
      ? new Date(shipped_at).toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");

    const customerName = order.customer_name ? ", " + order.customer_name : "";
    messageContent = messageContent
      .replace(/\{\{customer_name\}\}/g, customerName)
      .replace(/\{\{order_id\}\}/g, order.unique_order_id || String(order.id))
      .replace(/\{\{tracking_code\}\}/g, tracking_code)
      .replace(/\{\{shipped_at\}\}/g, shippedDate);

    let phone = order.customer_phone.replace(/\D/g, "");
    if (!phone.startsWith("55")) phone = "55" + phone;

    let sendSuccess = false;
    let msgId: string | null = null;

    if (provider === "evolution") {
      const instanceName = integration.evolution_instance_name;
      if (!isDbTriggerCall) {
        messageContent = addMessageVariation(messageContent);
      }
      await sendPresenceAvailable(instanceName, phone);
      await sendPresenceComposing(instanceName, phone, calcTypingDuration(messageContent.length));
      const result = await evoSendText(instanceName, phone, messageContent);
      sendSuccess = result.success;
    } else {
      if (!isDbTriggerCall) {
        await simulateTyping(integration.zapi_instance_id, integration.zapi_token, integration.zapi_client_token, phone);
        const delayMs = await antiBlockDelayLive();
        logAntiBlockDelay("zapi-send-tracking", delayMs);
        messageContent = addMessageVariation(messageContent);
      }

      const zapiUrl = "https://api.z-api.io/instances/" + integration.zapi_instance_id + "/token/" + integration.zapi_token + "/send-text";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (integration.zapi_client_token) headers["Client-Token"] = integration.zapi_client_token;

      const zapiResponse = await fetch(zapiUrl, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(isDbTriggerCall ? 4000 : 15000),
        body: JSON.stringify({ phone, message: messageContent }),
      });

      const zapiResult = await zapiResponse.json();
      sendSuccess = zapiResponse.ok;
      msgId = zapiResult.messageId || null;

      if (!zapiResponse.ok) {
        await supabase.from("whatsapp_messages").insert({
          tenant_id,
          phone: order.customer_phone,
          message: "FALHA ao enviar rastreio " + tracking_code,
          type: "system_log",
          order_id: order.id,
          created_at: new Date().toISOString(),
        });
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao enviar mensagem" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    await supabase.from("whatsapp_messages").insert({
      tenant_id,
      phone: order.customer_phone,
      message: messageContent,
      type: "outgoing",
      order_id: order.id,
      sent_at: new Date().toISOString(),
      zapi_message_id: msgId,
      delivery_status: sendSuccess ? "SENT" : "FAILED",
    });

    return new Response(
      JSON.stringify({ success: true, message: "Mensagem de rastreio enviada", messageId: msgId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});