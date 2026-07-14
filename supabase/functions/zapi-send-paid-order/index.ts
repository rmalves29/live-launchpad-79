import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  antiBlockDelayLive,
  logAntiBlockDelay,
  addMessageVariation,
  getThrottleDelay,
  simulateTyping,
} from "../_shared/anti-block-delay.ts";
import {
  sendText as evoSendText,
  sendPresenceAvailable,
  sendPresenceComposing,
  calcTypingDuration,
} from "../_shared/evolution-api.ts";
import { tryPushBeforeWhatsApp } from "../_shared/push-fallback.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface PaidOrderRequest {
  order_id: number;
  tenant_id: string;
}

function validateInternalRequest(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (authHeader && supabaseServiceKey && authHeader.includes(supabaseServiceKey.substring(0, 50))) return true;
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (supabaseUrl && origin.includes(new URL(supabaseUrl).hostname)) return true;
  console.log("[zapi-send-paid-order] Warning: Request without internal validation markers");
  return true;
}

async function getCredentials(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, uazapi_url, uazapi_token, provider, is_active, send_paid_order_msg")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  if (data.send_paid_order_msg === false) return { disabled: true };

  const provider = data.provider || "zapi";
  if (provider === "uazapi") {
    if (!((data.uazapi_url && data.uazapi_token) ? (data.uazapi_url + "|" + data.uazapi_token) : null)) return null;
    return { provider: "uazapi" as const, instanceName: ((data.uazapi_url && data.uazapi_token) ? (data.uazapi_url + "|" + data.uazapi_token) : null), disabled: false };
  }
  if (!data.zapi_instance_id || !data.zapi_token) return null;
  return {
    provider: "zapi" as const,
    instanceId: data.zapi_instance_id,
    token: data.zapi_token,
    clientToken: data.zapi_client_token || "",
    disabled: false,
  };
}

async function getTemplate(supabase: any, tenantId: string) {
  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("type", "PAID_ORDER")
    .maybeSingle();

  if (template?.content) return template.content;

  return "Pagamento Confirmado - Pedido #{{order_id}}\n\nRecebemos seu pagamento!\nValor: *R$ {{total}}*\n\nSeu pedido esta sendo preparado.\n\nObrigado pela preferencia!";
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (!cleaned.startsWith("55")) cleaned = "55" + cleaned;
  return cleaned;
}

function validateRequest(body: any): body is PaidOrderRequest {
  if (!body || typeof body !== "object") return false;
  if (!body.order_id || (typeof body.order_id !== "number" && typeof body.order_id !== "string")) return false;
  if (!body.tenant_id || typeof body.tenant_id !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(body.tenant_id)) return false;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const timestamp = new Date().toISOString();

  try {
    if (!validateInternalRequest(req)) {
      return new Response(JSON.stringify({ error: "Nao autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    if (!validateRequest(body)) {
      return new Response(JSON.stringify({ error: "Dados invalidos - order_id e tenant_id (UUID) sao obrigatorios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { order_id, tenant_id } = body;
    console.log("[" + timestamp + "] [zapi-send-paid-order] Processing order " + order_id + " for tenant " + tenant_id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Pedido nao encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const credentials = await getCredentials(supabase, tenant_id);
    if (!credentials) {
      return new Response(JSON.stringify({ error: "WhatsApp nao configurado", sent: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (credentials.disabled) {
      return new Response(JSON.stringify({ sent: false, disabled: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const template = await getTemplate(supabase, tenant_id);
    const totalFormatted = order.total_amount?.toFixed(2).replace(".", ",") || "0,00";
    const baseMessage = template
      .replace(/\{\{order_id\}\}/g, String(order_id))
      .replace(/\{\{total\}\}/g, totalFormatted)
      .replace(/\{\{total_amount\}\}/g, totalFormatted)
      .replace(/\{\{valor\}\}/g, totalFormatted)
      .replace(/\{\{customer_name\}\}/g, order.customer_name || "Cliente")
      .replace(/\{\{nome\}\}/g, order.customer_name || "Cliente");
    const message = addMessageVariation(baseMessage);

    const formattedPhone = formatPhoneNumber(order.customer_phone);

    // Push-first: se cliente tiver push assinado e template ativo, envia push e SUPRIME WhatsApp.
    const pushSent = await tryPushBeforeWhatsApp({
      tenantId: tenant_id,
      templateType: "order_paid",
      customerPhone: order.customer_phone,
      vars: {
        nome: order.customer_name || "Cliente",
        order_id: order.unique_order_id || String(order_id),
        pedido_numero: order.unique_order_id || String(order_id),
        total_amount: "R$ " + totalFormatted,
        total: totalFormatted,
      },
    });
    if (pushSent) {
      await supabase.from("orders").update({ payment_confirmation_sent: true }).eq("id", order_id);
      return new Response(JSON.stringify({ sent: false, push_sent: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const throttleDelay = await getThrottleDelay(formattedPhone);
    if (throttleDelay > 0) console.log("[zapi-send-paid-order] Throttle delay: " + (throttleDelay / 1000).toFixed(1) + "s");

    let sendOk = false;
    let zapiMessageId: string | null = null;
    let zapiZaapId: string | null = null;

    if (credentials.provider === "uazapi") {
      await sendPresenceAvailable(credentials.instanceName, formattedPhone);
      await (await import("../_shared/evolution-api.ts")).runTypingSegments(credentials.instanceName, formattedPhone, message.length);
      const result = await evoSendText(credentials.instanceName, formattedPhone, message);
      sendOk = result.success;
    } else {
      await simulateTyping(credentials.instanceId, credentials.token, credentials.clientToken, formattedPhone, message.length, true);
      const delayMs = await antiBlockDelayLive();
      logAntiBlockDelay("zapi-send-paid-order", delayMs);

      const sendUrl = ZAPI_BASE_URL + "/instances/" + credentials.instanceId + "/token/" + credentials.token + "/send-text";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (credentials.clientToken) headers["Client-Token"] = credentials.clientToken;

      const response = await fetch(sendUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: formattedPhone, message }),
      });

      const responseText = await response.text();
      console.log("[zapi-send-paid-order] Response: " + response.status + " - " + responseText.substring(0, 200));
      sendOk = response.ok;
      try {
        const responseJson = JSON.parse(responseText);
        zapiMessageId = responseJson.messageId || null;
        zapiZaapId = responseJson.zaapId || responseJson.id || null;
      } catch (e) {}
    }

    await supabase.from("whatsapp_messages").insert({
      tenant_id,
      phone: formattedPhone,
      message: message.substring(0, 500),
      type: "outgoing",
      order_id,
      sent_at: new Date().toISOString(),
      zapi_message_id: zapiMessageId,
      zapi_zaap_id: zapiZaapId,
      delivery_status: sendOk ? "SENT" : "FAILED",
    });

    if (sendOk) {
      await supabase.from("orders").update({ payment_confirmation_sent: true }).eq("id", order_id);
    }

    return new Response(
      JSON.stringify({ sent: sendOk, messageId: zapiMessageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[zapi-send-paid-order] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message, sent: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});