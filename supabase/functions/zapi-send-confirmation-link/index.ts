import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  antiBlockDelayLive,
  logAntiBlockDelay,
  addMessageVariation,
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

const ZAPI_BASE_URL = "https://api.z-api.io";

interface ConfirmationLinkRequest {
  tenant_id: string;
  customer_phone: string;
  confirmation_id: string;
}

async function getCredentials(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, evolution_instance_name, uazapi_url, uazapi_token, provider, is_active, item_added_confirmation_template")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  const provider = data.provider || "zapi";
  const confirmationTemplate = data.item_added_confirmation_template || getDefaultConfirmationTemplate();

  if (provider === "uazapi") {
    if (!data.evolution_instance_name) return null;
    return { provider: "uazapi" as const, instanceName: data.evolution_instance_name, confirmationTemplate };
  }
  if (!data.zapi_instance_id || !data.zapi_token) return null;
  return {
    provider: "zapi" as const,
    instanceId: data.zapi_instance_id,
    token: data.zapi_token,
    clientToken: data.zapi_client_token || "",
    confirmationTemplate,
  };
}

function getDefaultConfirmationTemplate(): string {
  return "Aqui esta o seu link exclusivo para finalizar a compra:\n\n{{checkout_url}}\n\nQualquer duvida estou a disposicao!";
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (!cleaned.startsWith("55")) cleaned = "55" + cleaned;
  return cleaned;
}

async function simulateTypingZapi(instanceId: string, token: string, clientToken: string, phone: string): Promise<void> {
  try {
    const typingUrl = ZAPI_BASE_URL + "/instances/" + instanceId + "/token/" + token + "/typing";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clientToken) headers["Client-Token"] = clientToken;
    await fetch(typingUrl, { method: "POST", headers, body: JSON.stringify({ phone, duration: 3 }) });
    await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 2000));
  } catch (e) {
    console.log("[zapi-send-confirmation-link] Typing simulation failed, continuing...");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { tenant_id, customer_phone, confirmation_id } = body as ConfirmationLinkRequest;

    if (!tenant_id || !customer_phone || !confirmation_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[zapi-send-confirmation-link] Processing confirmation " + confirmation_id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: confirmation, error: confError } = await supabase
      .from("pending_message_confirmations")
      .select("*")
      .eq("id", confirmation_id)
      .eq("status", "pending")
      .maybeSingle();

    if (confError || !confirmation) {
      return new Response(JSON.stringify({ error: "Confirmation not found or already processed", sent: false }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (new Date(confirmation.expires_at) < new Date()) {
      await supabase.from("pending_message_confirmations").update({ status: "expired" }).eq("id", confirmation_id);
      return new Response(JSON.stringify({ error: "Confirmation expired", sent: false }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const credentials = await getCredentials(supabase, tenant_id);
    if (!credentials) {
      return new Response(JSON.stringify({ error: "WhatsApp not configured", sent: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const formattedPhone = formatPhoneNumber(customer_phone);
    const { confirmationTemplate } = credentials;

    const meta = (confirmation.metadata || {}) as Record<string, any>;
    const productName = meta.product_name || "";
    const productCode = meta.product_code || "";
    const quantity = meta.quantity ?? "";
    const unitPriceNum = typeof meta.unit_price === "number" ? meta.unit_price : Number(meta.unit_price) || 0;
    const originalPriceNum = typeof meta.original_price === "number" ? meta.original_price : Number(meta.original_price) || 0;
    const unitPriceStr = unitPriceNum ? unitPriceNum.toFixed(2) : "";
    const totalStr = unitPriceNum && quantity ? (unitPriceNum * Number(quantity)).toFixed(2) : "";
    const originalPriceStr = originalPriceNum ? originalPriceNum.toFixed(2) : "";
    const promoPriceStr = originalPriceNum && originalPriceNum > unitPriceNum ? unitPriceStr : "";

    let message = confirmationTemplate
      .replace(/\{\{checkout_url\}\}/g, confirmation.checkout_url || "")
      .replace(/\{\{link\}\}/g, confirmation.checkout_url || "")
      .replace(/\{\{produto\}\}/g, productName ? productName + (productCode ? " (" + productCode + ")" : "") : "")
      .replace(/\{\{quantidade\}\}/g, String(quantity))
      .replace(/\{\{valor\}\}/g, unitPriceStr)
      .replace(/\{\{preco\}\}/g, unitPriceStr)
      .replace(/\{\{total\}\}/g, totalStr)
      .replace(/\{\{subtotal\}\}/g, totalStr)
      .replace(/\{\{codigo\}\}/g, productCode)
      .replace(/\{\{valor_original\}\}/g, originalPriceStr)
      .replace(/\{\{valor_promo\}\}/g, promoPriceStr);

    if (!originalPriceStr || !promoPriceStr) {
      message = message
        .split("\n")
        .filter((line) => {
          if (!originalPriceStr && line.includes("{{valor_original}}")) return false;
          if (!promoPriceStr && line.includes("{{valor_promo}}")) return false;
          return true;
        })
        .join("\n");
    }

    message = addMessageVariation(message);

    let sendOk = false;
    let zapiMessageId: string | null = null;

    if (credentials.provider === "uazapi") {
      await sendPresenceAvailable(credentials.instanceName, formattedPhone);
      await sendPresenceComposing(credentials.instanceName, formattedPhone, calcTypingDuration(message.length));
      const result = await evoSendText(credentials.instanceName, formattedPhone, message);
      sendOk = result.success;
    } else {
      await simulateTypingZapi(credentials.instanceId, credentials.token, credentials.clientToken, formattedPhone);
      const delayMs = await antiBlockDelayLive();
      logAntiBlockDelay("zapi-send-confirmation-link", delayMs);

      const sendUrl = ZAPI_BASE_URL + "/instances/" + credentials.instanceId + "/token/" + credentials.token + "/send-text";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (credentials.clientToken) headers["Client-Token"] = credentials.clientToken;

      const response = await fetch(sendUrl, { method: "POST", headers, body: JSON.stringify({ phone: formattedPhone, message }) });
      const responseText = await response.text();
      console.log("[zapi-send-confirmation-link] Response: " + response.status + " - " + responseText.substring(0, 200));
      sendOk = response.ok;
      try {
        const responseJson = JSON.parse(responseText);
        zapiMessageId = responseJson.messageId || responseJson.id || null;
      } catch (e) {}
    }

    await supabase.from("pending_message_confirmations").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", confirmation_id);
    await supabase.from("whatsapp_messages").insert({
      tenant_id,
      phone: formattedPhone,
      message: message.substring(0, 500),
      type: "outgoing",
      sent_at: new Date().toISOString(),
      zapi_message_id: zapiMessageId,
      delivery_status: sendOk ? "SENT" : "FAILED",
    });

    return new Response(JSON.stringify({ sent: sendOk, messageId: zapiMessageId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[zapi-send-confirmation-link] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message, sent: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});