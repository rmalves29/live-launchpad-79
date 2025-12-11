import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";
const MAX_RECIPIENTS_PER_REQUEST = 500;
const MAX_MESSAGE_LENGTH = 2000;

interface BroadcastRequest {
  tenant_id: string;
  message: string;
  orderStatus?: 'paid' | 'unpaid' | 'all';
  orderDate?: string;
  phones?: string[];
  delayMs?: number;
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

async function getUserTenantId(supabase: any, userId: string): Promise<string | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    return null;
  }

  return profile.tenant_id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    // Verify JWT authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.log(`[${timestamp}] [zapi-broadcast] Missing authorization header`);
      return new Response(
        JSON.stringify({ error: "Não autorizado - token de autenticação necessário" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create client with user's JWT to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the user's identity
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.log(`[${timestamp}] [zapi-broadcast] Invalid token:`, userError?.message);
      return new Response(
        JSON.stringify({ error: "Token inválido ou expirado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: BroadcastRequest = await req.json();
    const { tenant_id, message, orderStatus = 'all', orderDate, phones, delayMs = 2000 } = body;

    console.log(`[${timestamp}] [zapi-broadcast] User ${user.id} requesting broadcast for tenant ${tenant_id}`);

    // Validate required fields
    if (!tenant_id || !message) {
      return new Response(
        JSON.stringify({ error: "tenant_id e message são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate message length
    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Mensagem muito longa (máximo ${MAX_MESSAGE_LENGTH} caracteres)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user belongs to the tenant or is super admin
    const userTenantId = await getUserTenantId(supabase, user.id);
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    
    const isSuperAdmin = profile?.role === 'super_admin';
    
    if (!isSuperAdmin && userTenantId !== tenant_id) {
      console.log(`[${timestamp}] [zapi-broadcast] Unauthorized: user tenant ${userTenantId} !== ${tenant_id}`);
      return new Response(
        JSON.stringify({ error: "Não autorizado para este tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = await getZAPICredentials(supabase, tenant_id);
    if (!credentials) {
      return new Response(
        JSON.stringify({ error: "Z-API não configurado", sent: 0, failed: 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let targetPhones: string[] = [];

    if (phones && phones.length > 0) {
      // Validate phone numbers
      targetPhones = phones
        .filter(p => p && typeof p === 'string')
        .map(p => formatPhoneNumber(p))
        .filter(p => p.length >= 10 && p.length <= 15);
    } else {
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

      const phoneSet = new Set<string>();
      orders?.forEach(order => {
        if (order.customer_phone) {
          phoneSet.add(formatPhoneNumber(order.customer_phone));
        }
      });
      targetPhones = Array.from(phoneSet);
    }

    // Apply recipient limit
    if (targetPhones.length > MAX_RECIPIENTS_PER_REQUEST) {
      console.log(`[${timestamp}] [zapi-broadcast] Limiting recipients from ${targetPhones.length} to ${MAX_RECIPIENTS_PER_REQUEST}`);
      targetPhones = targetPhones.slice(0, MAX_RECIPIENTS_PER_REQUEST);
    }

    console.log(`[zapi-broadcast] Sending to ${targetPhones.length} phones`);

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

    // Enforce minimum delay to prevent abuse
    const safeDelayMs = Math.max(delayMs, 1000);

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

        console.log(`[zapi-broadcast] Progress: ${sent + failed}/${targetPhones.length}`);

        if (safeDelayMs > 0 && (sent + failed) < targetPhones.length) {
          await sleep(safeDelayMs);
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
        results: results.slice(0, 50)
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
