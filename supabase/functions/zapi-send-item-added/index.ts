import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface ItemAddedRequest {
  tenant_id: string;
  customer_phone: string;
  product_name: string;
  product_code: string;
  quantity: number;
  unit_price: number;
}

async function getZAPICredentials(supabase: any, tenantId: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, is_active, provider")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !integration || !integration.zapi_instance_id || !integration.zapi_token) {
    return null;
  }

  return {
    instanceId: integration.zapi_instance_id,
    token: integration.zapi_token
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

  // Default template
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
  const total = (data.quantity * data.unit_price).toFixed(2);
  
  return template
    .replace(/\{\{produto\}\}/g, `${data.product_name} (${data.product_code})`)
    .replace(/\{\{quantidade\}\}/g, String(data.quantity))
    .replace(/\{\{valor\}\}/g, total)
    .replace(/\{\{codigo\}\}/g, data.product_code);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const body: ItemAddedRequest = await req.json();
    const { tenant_id, customer_phone, product_name, product_code, quantity, unit_price } = body;

    console.log(`[${timestamp}] [zapi-send-item-added] Processing for tenant ${tenant_id}`);

    if (!tenant_id || !customer_phone || !product_name) {
      return new Response(
        JSON.stringify({ error: "Dados incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const credentials = await getZAPICredentials(supabase, tenant_id);
    if (!credentials) {
      console.log("[zapi-send-item-added] Z-API not configured for this tenant");
      return new Response(
        JSON.stringify({ error: "Z-API não configurado", sent: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const template = await getTemplate(supabase, tenant_id);
    const message = formatMessage(template, body);
    const formattedPhone = formatPhoneNumber(customer_phone);

    const { instanceId, token } = credentials;
    const sendUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;

    console.log(`[zapi-send-item-added] Sending to ${formattedPhone}`);

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': token
      },
      body: JSON.stringify({ phone: formattedPhone, message })
    });

    const responseText = await response.text();
    console.log(`[zapi-send-item-added] Response: ${response.status} - ${responseText.substring(0, 200)}`);

    // Log message
    await supabase.from('whatsapp_messages').insert({
      tenant_id,
      phone: formattedPhone,
      message: message.substring(0, 500),
      type: 'item_added',
      product_name,
      sent_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ sent: response.ok, status: response.status }),
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
