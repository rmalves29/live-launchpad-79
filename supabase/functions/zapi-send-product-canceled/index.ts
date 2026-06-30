import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  antiBlockDelayLive,
  logAntiBlockDelay,
  addMessageVariation,
  getThrottleDelay,
  checkTenantRateLimit,
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface ProductCanceledRequest {
  tenant_id: string;
  customer_phone: string;
  product_name: string;
  product_code?: string;
}

function validateInternalRequest(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (authHeader && supabaseServiceKey && authHeader.includes(supabaseServiceKey.substring(0, 50))) return true;
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (supabaseUrl && origin.includes(new URL(supabaseUrl).hostname)) return true;
  console.log("[zapi-send-product-canceled] Warning: Request without internal validation markers");
  return true;
}

async function getCredentials(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, evolution_instance_name, uazapi_url, uazapi_token, provider, is_active, send_product_canceled_msg")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  if (data.send_product_canceled_msg === false) return { disabled: true };

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
    .eq("type", "PRODUCT_CANCELED")
    .maybeSingle();
  if (template?.content) return template.content;
  return "O produto \"{{produto}}\" foi cancelado do seu pedido.\n\nQualquer duvida, entre em contato conosco.";
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (!cleaned.startsWith("55")) cleaned = "55" + cleaned;
  return cleaned;
}

function formatMessage(template: string, data: ProductCanceledRequest): string {
  let productDisplay = data.product_name;
  if (data.product_code) productDisplay = data.product_name + " (" + data.product_code + ")";
  return template
    .replace(/\{\{produto\}\}/g, productDisplay)
    .replace(/\{\{codigo\}\}/g, data.product_code || "");
}

function validateRequest(body: any): body is ProductCanceledRequest {
  if (!body || typeof body !== "object") return false;
  if (!body.tenant_id || typeof body.tenant_id !== "string") return false;
  if (!body.customer_phone || typeof body.customer_phone !== "string") return false;
  if (!body.product_name || typeof body.product_name !== "string") return false;
  if (body.product_name.length > 200) return false;
  if (body.customer_phone.replace(/\D/g, "").length < 10) return false;
  if (body.customer_phone.replace(/\D/g, "").length > 15) return false;
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
      return new Response(JSON.stringify({ error: "Dados invalidos ou incompletos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { tenant_id, customer_phone, product_name, product_code } = body;
    console.log("[" + timestamp + "] [zapi-send-product-canceled] Processing for tenant " + tenant_id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: tenant, error: tenantError } = await supabase.from("tenants").select("id").eq("id", tenant_id).maybeSingle();
    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant nao encontrado", sent: false }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const credentials = await getCredentials(supabase, tenant_id);
    if (!credentials) {
      return new Response(JSON.stringify({ error: "WhatsApp nao configurado", sent: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (credentials.disabled) {
      return new Response(JSON.stringify({ sent: false, disabled: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!checkTenantRateLimit(tenant_id)) {
      return new Response(JSON.stringify({ sent: false, rateLimited: true }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const template = await getTemplate(supabase, tenant_id);
    const baseMessage = formatMessage(template, body);
    const message = addMessageVariation(baseMessage);
    const formattedPhone = formatPhoneNumber(customer_phone);

    const throttleDelay = await getThrottleDelay(formattedPhone);
    if (throttleDelay > 0) console.log("[zapi-send-product-canceled] Throttle delay: " + (throttleDelay / 1000).toFixed(1) + "s");

    let sendOk = false;

    if (credentials.provider === "uazapi") {
      await sendPresenceAvailable(credentials.instanceName, formattedPhone);
      await sendPresenceComposing(credentials.instanceName, formattedPhone, calcTypingDuration(message.length));
      const result = await evoSendText(credentials.instanceName, formattedPhone, message);
      sendOk = result.success;
    } else {
      await simulateTyping(credentials.instanceId, credentials.token, credentials.clientToken, formattedPhone);
      const delayMs = await antiBlockDelayLive();
      logAntiBlockDelay("zapi-send-product-canceled", delayMs);

      const sendUrl = ZAPI_BASE_URL + "/instances/" + credentials.instanceId + "/token/" + credentials.token + "/send-text";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (credentials.clientToken) headers["Client-Token"] = credentials.clientToken;

      const response = await fetch(sendUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: formattedPhone, message }),
      });
      const responseText = await response.text();
      console.log("[zapi-send-product-canceled] Response: " + response.status + " - " + responseText.substring(0, 200));
      sendOk = response.ok;
    }

    await supabase.from("whatsapp_messages").insert({
      tenant_id,
      phone: formattedPhone,
      message: message.substring(0, 500),
      type: "outgoing",
      product_name: product_name.substring(0, 100),
      sent_at: new Date().toISOString(),
      delivery_status: sendOk ? "SENT" : "FAILED",
    });

    return new Response(JSON.stringify({ sent: sendOk }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[zapi-send-product-canceled] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message, sent: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});