import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { antiBlockDelay, logAntiBlockDelay } from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface ItemAddedRequest {
  tenant_id: string;
  customer_phone: string;
  product_name: string;
  product_code: string;
  quantity: number;
  unit_price: number;
  order_id?: number;
}

// Validate that request comes from internal source (database trigger)
function validateInternalRequest(req: Request): boolean {
  // Check for service role key in authorization header (used by http_post from triggers)
  const authHeader = req.headers.get("authorization");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  // If called with service role key, it's from a database trigger
  if (authHeader && supabaseServiceKey && authHeader.includes(supabaseServiceKey.substring(0, 50))) {
    return true;
  }
  
  // Also accept calls from the same Supabase project (internal calls)
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (supabaseUrl && origin.includes(new URL(supabaseUrl).hostname)) {
    return true;
  }
  
  // For now, allow all calls but log a warning - this function is called by database triggers
  // which use http_post and don't have a way to add custom auth headers
  console.log("[zapi-send-item-added] Warning: Request without internal validation markers");
  return true;
}

async function getZAPICredentials(supabase: any, tenantId: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, is_active, provider, send_item_added_msg")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !integration || !integration.zapi_instance_id || !integration.zapi_token) {
    return null;
  }

  // Check if this message type is enabled
  if (integration.send_item_added_msg === false) {
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
    .eq("type", "ITEM_ADDED")
    .maybeSingle();

  if (template?.content) {
    return template.content;
  }

  return `🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

Digite *FINALIZAR* para concluir seu pedido.`;
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

function formatMessage(template: string, data: ItemAddedRequest): string {
  const unitPrice = data.unit_price.toFixed(2);
  const total = (data.quantity * data.unit_price).toFixed(2);
  
  // Gera quantidade aleatória entre 2 e 4 para variação anti-bloqueio
  const randomQty = Math.floor(Math.random() * 3) + 2; // 2, 3 ou 4
  
  return template
    .replace(/\{\{produto\}\}/g, `${data.product_name} (${data.product_code})`)
    .replace(/\{\{quantidade\}\}/g, String(data.quantity))
    .replace(/\{\{qtd_aleatoria\}\}/g, String(randomQty))
    .replace(/\{\{valor\}\}/g, unitPrice)
    .replace(/\{\{preco\}\}/g, unitPrice)
    .replace(/\{\{total\}\}/g, total)
    .replace(/\{\{subtotal\}\}/g, total)
    .replace(/\{\{codigo\}\}/g, data.product_code);
}

// Input validation
function validateRequest(body: any): body is ItemAddedRequest {
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
    // Validate internal request
    if (!validateInternalRequest(req)) {
      console.log(`[${timestamp}] [zapi-send-item-added] Unauthorized external request`);
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    
    // Validate input
    if (!validateRequest(body)) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos ou incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tenant_id, customer_phone, product_name, product_code, quantity, unit_price, order_id } = body;

    console.log(`[${timestamp}] [zapi-send-item-added] Processing for tenant ${tenant_id}`);

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
      console.log(`[${timestamp}] [zapi-send-item-added] Tenant not found: ${tenant_id}`);
      return new Response(
        JSON.stringify({ error: "Tenant não encontrado", sent: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = await getZAPICredentials(supabase, tenant_id);
    if (!credentials) {
      console.log("[zapi-send-item-added] Z-API not configured for this tenant");
      return new Response(
        JSON.stringify({ error: "Z-API não configurado", sent: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if message type is disabled
    if (credentials.disabled) {
      console.log("[zapi-send-item-added] Message type disabled for this tenant");
      return new Response(
        JSON.stringify({ sent: false, disabled: true, message: "Envio de mensagem 'Item Adicionado' desativado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const template = await getTemplate(supabase, tenant_id);
    const message = formatMessage(template, body);
    const formattedPhone = formatPhoneNumber(customer_phone);

    const { instanceId, token, clientToken } = credentials;
    const sendUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;

    // Apply anti-block delay before sending (1-4 seconds)
    const delayMs = await antiBlockDelay(1000, 4000);
    logAntiBlockDelay('zapi-send-item-added', delayMs);

    console.log(`[zapi-send-item-added] Sending to ${formattedPhone}`);

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
    console.log(`[zapi-send-item-added] Response: ${response.status} - ${responseText.substring(0, 200)}`);

    // Parse response to get message ID
    let zapiMessageId = null;
    try {
      const responseJson = JSON.parse(responseText);
      zapiMessageId = responseJson.messageId || responseJson.id || null;
      console.log(`[zapi-send-item-added] Z-API Message ID: ${zapiMessageId}`);
    } catch (e) {
      console.log(`[zapi-send-item-added] Could not parse Z-API response for message ID`);
    }

    // Insert message record with Z-API message ID for tracking
    await supabase.from('whatsapp_messages').insert({
      tenant_id,
      phone: formattedPhone,
      message: message.substring(0, 500),
      type: 'item_added',
      product_name: product_name.substring(0, 100),
      sent_at: new Date().toISOString(),
      order_id: order_id || null,
      zapi_message_id: zapiMessageId,
      delivery_status: response.ok ? 'SENT' : 'FAILED'
    });

    // Update order item_added_message_sent flag
    if (order_id && response.ok) {
      await supabase
        .from('orders')
        .update({ item_added_message_sent: true })
        .eq('id', order_id);
    }

    return new Response(
      JSON.stringify({ sent: response.ok, status: response.status, messageId: zapiMessageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[zapi-send-item-added] Error:`, error.message);
    return new Response(
      JSON.stringify({ error: error.message, sent: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
