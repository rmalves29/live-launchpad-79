import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface BroadcastRequest {
  tenant_id: string;
  message: string;
  orderStatus?: 'paid' | 'unpaid' | 'all';
  orderDate?: string;
  phones?: string[]; // Optional: direct list of phones
  delayMs?: number; // Delay between messages in ms
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

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const body: BroadcastRequest = await req.json();
    const { tenant_id, message, orderStatus = 'all', orderDate, phones, delayMs = 2000 } = body;

    console.log(`[${timestamp}] [zapi-broadcast] Starting broadcast for tenant ${tenant_id}`);

    if (!tenant_id || !message) {
      return new Response(
        JSON.stringify({ error: "tenant_id e message são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const credentials = await getZAPICredentials(supabase, tenant_id);
    if (!credentials) {
      return new Response(
        JSON.stringify({ error: "Z-API não configurado", sent: 0, failed: 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let targetPhones: string[] = [];

    if (phones && phones.length > 0) {
      targetPhones = phones;
    } else {
      // Get phones from orders
      let query = supabase
        .from('orders')
        .select('customer_phone')
        .eq('tenant_id', tenant_id);

      if (orderStatus === 'paid') {
        query = query.eq('is_paid', true);
      } else if (orderStatus === 'unpaid') {
        query = query.eq('is_paid', false);
      }

      if (orderDate) {
        query = query.eq('event_date', orderDate);
      }

      const { data: orders, error: ordersError } = await query;

      if (ordersError) {
        console.error("[zapi-broadcast] Error fetching orders:", ordersError);
        return new Response(
          JSON.stringify({ error: "Erro ao buscar pedidos" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get unique phones
      const phoneSet = new Set<string>();
      orders?.forEach(order => {
        if (order.customer_phone) {
          phoneSet.add(formatPhoneNumber(order.customer_phone));
        }
      });
      targetPhones = Array.from(phoneSet);
    }

    console.log(`[zapi-broadcast] Found ${targetPhones.length} unique phones to send`);

    if (targetPhones.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, total: 0, message: "Nenhum contato encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { instanceId, token } = credentials;
    const sendUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;

    let sent = 0;
    let failed = 0;
    const results: Array<{ phone: string; success: boolean; error?: string }> = [];

    for (const phone of targetPhones) {
      try {
        const response = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': token
          },
          body: JSON.stringify({ phone, message })
        });

        if (response.ok) {
          sent++;
          results.push({ phone, success: true });
          
          // Log message
          await supabase.from('whatsapp_messages').insert({
            tenant_id,
            phone,
            message: message.substring(0, 500),
            type: 'mass',
            sent_at: new Date().toISOString()
          });
        } else {
          const errorText = await response.text();
          failed++;
          results.push({ phone, success: false, error: errorText.substring(0, 100) });
        }

        console.log(`[zapi-broadcast] Progress: ${sent + failed}/${targetPhones.length} (sent: ${sent}, failed: ${failed})`);

        // Delay between messages to avoid rate limiting
        if (delayMs > 0 && (sent + failed) < targetPhones.length) {
          await sleep(delayMs);
        }

      } catch (error: any) {
        failed++;
        results.push({ phone, success: false, error: error.message });
        console.error(`[zapi-broadcast] Error sending to ${phone}:`, error.message);
      }
    }

    console.log(`[zapi-broadcast] Completed: sent=${sent}, failed=${failed}`);

    return new Response(
      JSON.stringify({
        sent,
        failed,
        total: targetPhones.length,
        results: results.slice(0, 50) // Return first 50 results for debugging
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[zapi-broadcast] Error:`, error.message);
    return new Response(
      JSON.stringify({ error: error.message, sent: 0, failed: 0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
