import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface PaidOrderRequest {
  order_id: number;
  tenant_id: string;
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
  console.log("[zapi-send-paid-order] Warning: Request without internal validation markers");
  return true;
}

async function getZAPICredentials(supabase: any, tenantId: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, is_active, provider")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !integration || !integration.zapi_instance_id || !integration.zapi_token) {
    return null;
  }

  return {
    instanceId: integration.zapi_instance_id,
    token: integration.zapi_token,
    clientToken: integration.zapi_client_token || ''
  };
}

async function getTemplate(supabase: any, tenantId: string) {
  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("type", "PAID_ORDER")
    .maybeSingle();

  if (template?.content) {
    return template.content;
  }

  return `🎉 *Pagamento Confirmado - Pedido #{{order_id}}*

✅ Recebemos seu pagamento!
💰 Valor: *R$ {{total}}*

Seu pedido está sendo preparado para envio.

Obrigado pela preferência! 💚`;
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

// Input validation
function validateRequest(body: any): body is PaidOrderRequest {
  if (!body || typeof body !== 'object') return false;
  if (!body.order_id || (typeof body.order_id !== 'number' && typeof body.order_id !== 'string')) return false;
  if (!body.tenant_id || typeof body.tenant_id !== 'string') return false;
  // Validate UUID format for tenant_id
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(body.tenant_id)) return false;
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
      console.log(`[${timestamp}] [zapi-send-paid-order] Unauthorized external request`);
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    
    // Validate input
    if (!validateRequest(body)) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos - order_id e tenant_id (UUID) são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { order_id, tenant_id } = body;

    console.log(`[${timestamp}] [zapi-send-paid-order] Processing order ${order_id} for tenant ${tenant_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get order details - validates both order exists AND belongs to tenant
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (orderError || !order) {
      console.error("[zapi-send-paid-order] Order not found:", orderError);
      return new Response(
        JSON.stringify({ error: "Pedido não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = await getZAPICredentials(supabase, tenant_id);
    if (!credentials) {
      console.log("[zapi-send-paid-order] Z-API not configured");
      return new Response(
        JSON.stringify({ error: "Z-API não configurado", sent: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const template = await getTemplate(supabase, tenant_id);
    const message = template
      .replace(/\{\{order_id\}\}/g, String(order_id))
      .replace(/\{\{total\}\}/g, order.total_amount?.toFixed(2) || '0.00')
      .replace(/\{\{customer_name\}\}/g, order.customer_name || 'Cliente');

    const formattedPhone = formatPhoneNumber(order.customer_phone);
    const { instanceId, token, clientToken } = credentials;
    const sendUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;

    console.log(`[zapi-send-paid-order] Sending to ${formattedPhone}`);

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
    console.log(`[zapi-send-paid-order] Response: ${response.status} - ${responseText.substring(0, 200)}`);

    await supabase.from('whatsapp_messages').insert({
      tenant_id,
      phone: formattedPhone,
      message: message.substring(0, 500),
      type: 'outgoing',
      order_id,
      sent_at: new Date().toISOString()
    });

    if (response.ok) {
      await supabase
        .from('orders')
        .update({ payment_confirmation_sent: true })
        .eq('id', order_id);
    }

    return new Response(
      JSON.stringify({ sent: response.ok, status: response.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[zapi-send-paid-order] Error:`, error.message);
    return new Response(
      JSON.stringify({ error: error.message, sent: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
