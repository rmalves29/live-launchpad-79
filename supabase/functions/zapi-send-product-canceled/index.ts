import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  antiBlockDelayLive, 
  logAntiBlockDelay, 
  addMessageVariation,
  getThrottleDelay,
  checkTenantRateLimit
} from "../_shared/anti-block-delay.ts";

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

// Validate that request comes from internal source (database trigger)
function validateInternalRequest(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (authHeader && supabaseServiceKey && authHeader.includes(supabaseServiceKey.substring(0, 50))) {
    return true;
  }
  
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (supabaseUrl && origin.includes(new URL(supabaseUrl).hostname)) {
    return true;
  }
  
  console.log("[zapi-send-product-canceled] Warning: Request without internal validation markers");
  return true;
}

async function getZAPICredentials(supabase: any, tenantId: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, is_active, provider, send_product_canceled_msg")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !integration || !integration.zapi_instance_id || !integration.zapi_token) {
    return null;
  }

  // Check if this message type is enabled
  if (integration.send_product_canceled_msg === false) {
    return { disabled: true };
  }

  return {
    instanceId: integration.zapi_instance_id,
    token: integration.zapi_token,
    clientToken: integration.zapi_client_token || '',
    disabled: false
  };
}

async function getTemplate(supabase: any, tenantId: string) {
  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("type", "PRODUCT_CANCELED")
    .maybeSingle();

  if (template?.content) {
    return template.content;
  }

  return `❌ *Produto Cancelado*

O produto "{{produto}}" foi cancelado do seu pedido.

Qualquer dúvida, entre em contato conosco.`;
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

function formatMessage(template: string, data: ProductCanceledRequest): string {
  let productDisplay = data.product_name;
  if (data.product_code) {
    productDisplay = `${data.product_name} (${data.product_code})`;
  }
  
  return template
    .replace(/\{\{produto\}\}/g, productDisplay)
    .replace(/\{\{codigo\}\}/g, data.product_code || '');
}

// Input validation
function validateRequest(body: any): body is ProductCanceledRequest {
  if (!body || typeof body !== 'object') return false;
  if (!body.tenant_id || typeof body.tenant_id !== 'string') return false;
  if (!body.customer_phone || typeof body.customer_phone !== 'string') return false;
  if (!body.product_name || typeof body.product_name !== 'string') return false;
  if (body.product_name.length > 200) return false;
  if (body.customer_phone.replace(/\D/g, '').length < 10) return false;
  if (body.customer_phone.replace(/\D/g, '').length > 15) return false;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    if (!validateInternalRequest(req)) {
      console.log(`[${timestamp}] [zapi-send-product-canceled] Unauthorized external request`);
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    
    if (!validateRequest(body)) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos ou incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tenant_id, customer_phone, product_name, product_code } = body;

    console.log(`[${timestamp}] [zapi-send-product-canceled] Processing for tenant ${tenant_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      console.log(`[${timestamp}] [zapi-send-product-canceled] Tenant not found: ${tenant_id}`);
      return new Response(
        JSON.stringify({ error: "Tenant não encontrado", sent: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = await getZAPICredentials(supabase, tenant_id);
    if (!credentials) {
      console.log("[zapi-send-product-canceled] Z-API not configured for this tenant");
      return new Response(
        JSON.stringify({ error: "Z-API não configurado", sent: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if message type is disabled
    if (credentials.disabled) {
      console.log("[zapi-send-product-canceled] Message type disabled for this tenant");
      return new Response(
        JSON.stringify({ sent: false, disabled: true, message: "Envio de mensagem 'Produto Cancelado' desativado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit before processing
    if (!checkTenantRateLimit(tenant_id)) {
      console.log("[zapi-send-product-canceled] Rate limited - too many messages");
      return new Response(
        JSON.stringify({ sent: false, rateLimited: true, message: "Limite de mensagens por minuto excedido" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const template = await getTemplate(supabase, tenant_id);
    const baseMessage = formatMessage(template, body);
    // Add variations to avoid identical messages
    const message = addMessageVariation(baseMessage);
    const formattedPhone = formatPhoneNumber(customer_phone);

    const { instanceId, token, clientToken } = credentials;
    const sendUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;

    // Check for throttling (multiple messages to same phone)
    const throttleDelay = await getThrottleDelay(formattedPhone);
    if (throttleDelay > 0) {
      console.log(`[zapi-send-product-canceled] 🛡️ Throttle delay for ${formattedPhone}: ${(throttleDelay / 1000).toFixed(1)}s`);
    }

    // Apply extended anti-block delay (8-20 seconds for automatic messages)
    const delayMs = await antiBlockDelayLive();
    logAntiBlockDelay('zapi-send-product-canceled', delayMs);

    console.log(`[zapi-send-product-canceled] Sending to ${formattedPhone}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: formattedPhone, message })
    });

    const responseText = await response.text();
    console.log(`[zapi-send-product-canceled] Response: ${response.status} - ${responseText.substring(0, 200)}`);

    await supabase.from('whatsapp_messages').insert({
      tenant_id,
      phone: formattedPhone,
      message: message.substring(0, 500),
      type: 'outgoing',
      product_name: product_name.substring(0, 100),
      sent_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ sent: response.ok, status: response.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[zapi-send-product-canceled] Error:`, error.message);
    return new Response(
      JSON.stringify({ error: error.message, sent: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});