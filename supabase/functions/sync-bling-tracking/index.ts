import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_API_URL = "https://www.bling.com.br/Api/v3";

const SYNC_BATCH_LIMIT = 120;
const REQUEST_DELAY_MS = 150;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function blingFetchWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3
): Promise<{ response: Response; text: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, options);
    const text = await res.text();
    if (res.status !== 429 || attempt === maxAttempts) {
      return { response: res, text };
    }
    const waitMs = Math.round(700 * Math.pow(2, attempt - 1));
    console.log(`[sync-bling-tracking] Rate limited. Retry ${attempt}/${maxAttempts} in ${waitMs}ms`);
    await delay(waitMs);
  }
  throw new Error("Unreachable");
}

async function getValidAccessToken(supabase: any, integration: any): Promise<string | null> {
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      console.log("[sync-bling-tracking] Token expired, refreshing...");
      if (!integration.refresh_token || !integration.client_id || !integration.client_secret) return null;
      try {
        const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);
        const response = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${credentials}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: integration.refresh_token,
          }),
        });
        if (!response.ok) return null;
        const tokenData = await response.json();
        await supabase.from("integration_bling").update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("tenant_id", integration.tenant_id);
        return tokenData.access_token;
      } catch (e) {
        console.error("[sync-bling-tracking] Token refresh error:", e);
        return null;
      }
    }
  }
  return integration.access_token;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept optional tenant_id filter
    let filterTenantId: string | null = null;
    try {
      const body = await req.json();
      filterTenantId = body?.tenant_id || null;
    } catch { /* no body */ }

    console.log("🔄 [sync-bling-tracking] Iniciando sincronização de rastreios do Bling...", filterTenantId ? `Tenant: ${filterTenantId}` : "Todos os tenants");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find orders synced to Bling but without tracking code
    let query = supabase
      .from("orders")
      .select("id, tenant_id, bling_order_id, customer_phone, customer_name, unique_order_id")
      .not("bling_order_id", "is", null)
      .is("melhor_envio_tracking_code", null)
      .eq("is_paid", true)
      .neq("is_cancelled", true);

    if (filterTenantId) {
      query = query.eq("tenant_id", filterTenantId);
    }

    // Process newest orders first and limit to avoid timeout
    query = query.order("id", { ascending: false }).limit(50);

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error("❌ [sync-bling-tracking] Erro ao buscar pedidos:", ordersError);
      throw ordersError;
    }

    console.log(`📦 [sync-bling-tracking] Encontrados ${orders?.length || 0} pedidos para verificar`);

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum pedido para sincronizar", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by tenant
    const tenantOrders = new Map<string, typeof orders>();
    for (const order of orders) {
      const existing = tenantOrders.get(order.tenant_id) || [];
      existing.push(order);
      tenantOrders.set(order.tenant_id, existing);
    }

    let syncedCount = 0;
    let messagesCount = 0;

    for (const [tenantId, tenantOrderList] of tenantOrders) {
      // Get Bling integration
      const { data: blingIntegration } = await supabase
        .from("integration_bling")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();

      if (!blingIntegration) {
        console.log(`⚠️ [sync-bling-tracking] Tenant ${tenantId} sem integração Bling ativa`);
        continue;
      }

      const accessToken = await getValidAccessToken(supabase, blingIntegration);
      if (!accessToken) {
        console.error(`❌ [sync-bling-tracking] Não foi possível obter token para tenant ${tenantId}`);
        continue;
      }

      // Get Z-API integration for WhatsApp
      const { data: zapiIntegration } = await supabase
        .from("integration_whatsapp")
        .select("zapi_instance_id, zapi_token, zapi_client_token")
        .eq("tenant_id", tenantId)
        .eq("provider", "zapi")
        .eq("is_active", true)
        .maybeSingle();

      for (const order of tenantOrderList) {
        try {
          console.log(`🔍 [sync-bling-tracking] Verificando pedido ${order.id} (Bling ID: ${order.bling_order_id})`);

          // Add delay between API calls to avoid rate limiting
          await delay(500);

          const { response, text } = await blingFetchWithRetry(
            `${BLING_API_URL}/pedidos/vendas/${order.bling_order_id}`,
            {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json",
              },
            }
          );

          if (!response.ok) {
            console.log(`⚠️ [sync-bling-tracking] Erro ao consultar Bling para pedido ${order.id}: ${response.status}`);
            continue;
          }

          const blingOrder = JSON.parse(text);
          const transporte = blingOrder?.data?.transporte;
          const volumes = transporte?.volumes || [];

          let trackingCode: string | null = null;
          for (const volume of volumes) {
            if (volume?.codigoRastreamento) {
              trackingCode = volume.codigoRastreamento;
              break;
            }
          }

          if (!trackingCode) {
            console.log(`⏳ [sync-bling-tracking] Pedido ${order.id} ainda sem rastreio no Bling`);
            continue;
          }

          console.log(`✅ [sync-bling-tracking] Rastreio encontrado para pedido ${order.id}: ${trackingCode}`);

          // Update tracking code (trigger trg_send_tracking_whatsapp will auto-send WhatsApp)
          await supabase
            .from("orders")
            .update({ melhor_envio_tracking_code: trackingCode })
            .eq("id", order.id);

          syncedCount++;
          console.log(`📱 [sync-bling-tracking] Rastreio salvo, trigger automático enviará WhatsApp para pedido ${order.id}`);
        } catch (orderError) {
          console.error(`❌ [sync-bling-tracking] Erro ao processar pedido ${order.id}:`, orderError);
        }
      }
    }

    console.log(`✅ [sync-bling-tracking] Concluído: ${syncedCount} rastreios atualizados, ${messagesCount} mensagens enviadas`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sincronização concluída`,
        synced: syncedCount,
        messagesSent: messagesCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ [sync-bling-tracking] Erro crítico:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
