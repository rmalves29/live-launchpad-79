import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_API_URL = "https://api.bling.com.br/Api/v3";
const SYNC_BATCH_LIMIT = 40;
const CONCURRENCY = 5;

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
      console.log("[sync-bling-tracking] Token expirado, renovando...");
      if (!integration.refresh_token || !integration.client_id || !integration.client_secret) return null;
      try {
        const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);
        const response = await fetch("https://api.bling.com.br/Api/v3/oauth/token", {
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
        console.error("[sync-bling-tracking] Erro ao renovar token:", e);
        return null;
      }
    }
  }
  return integration.access_token;
}

async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let filterTenantId: string | null = null;
    let filterOrderId: number | null = null;
    try {
      const body = await req.json();
      filterTenantId = body?.tenant_id || null;
      filterOrderId = Number.isFinite(Number(body?.order_id)) ? Number(body.order_id) : null;
    } catch { /* sem body */ }

    console.log(
      `🔄 [sync-bling-tracking] Iniciando...`,
      filterTenantId ? `Tenant: ${filterTenantId}` : "Todos os tenants",
      filterOrderId ? `Pedido: ${filterOrderId}` : ""
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from("orders")
      .select("id, tenant_id, bling_order_id, customer_phone, customer_name, unique_order_id")
      .not("bling_order_id", "is", null)
      .is("melhor_envio_tracking_code", null)
      .eq("is_paid", true)
      .neq("is_cancelled", true);

    if (filterTenantId) query = query.eq("tenant_id", filterTenantId);
    if (filterOrderId) {
      query = query.eq("id", filterOrderId).limit(1);
    } else {
      query = query.order("id", { ascending: false }).limit(SYNC_BATCH_LIMIT);
    }

    const { data: orders, error: ordersError } = await query;
    if (ordersError) throw ordersError;

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum pedido para sincronizar", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 [sync-bling-tracking] ${orders.length} pedidos para verificar`);

    const tenantIds = [...new Set(orders.map(o => o.tenant_id))];

    const { data: blingIntegrations } = await supabase
      .from("integration_bling")
      .select("*")
      .in("tenant_id", tenantIds)
      .eq("is_active", true);

    const integrationByTenant = new Map<string, any>();
    for (const intg of blingIntegrations ?? []) {
      integrationByTenant.set(intg.tenant_id, intg);
    }

    const tokenByTenant = new Map<string, string>();
    for (const tenantId of tenantIds) {
      const intg = integrationByTenant.get(tenantId);
      if (!intg) continue;
      const token = await getValidAccessToken(supabase, intg);
      if (token) tokenByTenant.set(tenantId, token);
    }

    let syncedCount = 0;

    await runConcurrent(orders, async (order) => {
      const accessToken = tokenByTenant.get(order.tenant_id);
      if (!accessToken) {
        console.log(`⚠️ Tenant ${order.tenant_id} sem token, pulando pedido ${order.id}`);
        return;
      }

      try {
        const { response, text } = await blingFetchWithRetry(
          `${BLING_API_URL}/pedidos/vendas/${order.bling_order_id}`,
          { headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" } }
        );

        if (!response.ok) {
          console.log(`⚠️ Pedido ${order.id}: HTTP ${response.status} no Bling`);
          return;
        }

        const blingOrder = JSON.parse(text);
        const volumes = blingOrder?.data?.transporte?.volumes || [];
        let trackingCode: string | null = null;
        for (const v of volumes) {
          if (v?.codigoRastreamento) { trackingCode = v.codigoRastreamento; break; }
        }

        if (!trackingCode) {
          console.log(`📦 Pedido ${order.id}: sem rastreio ainda`);
          return;
        }

        const { error: updateError } = await supabase
          .from("orders")
          .update({ melhor_envio_tracking_code: trackingCode })
          .eq("id", order.id)
          .eq("tenant_id", order.tenant_id);

        if (updateError) {
          console.error(`❌ Pedido ${order.id}: erro ao salvar rastreio`, updateError);
          return;
        }

        syncedCount++;
        console.log(`✅ Pedido ${order.id}: rastreio ${trackingCode} salvo`);
      } catch (e) {
        console.error(`❌ Pedido ${order.id}: erro inesperado`, e);
      }
    }, CONCURRENCY);

    console.log(`✅ [sync-bling-tracking] Concluído: ${syncedCount}/${orders.length} rastreios atualizados`);

    return new Response(
      JSON.stringify({ success: true, message: "Sincronização concluída", synced: syncedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`❌ [sync-bling-tracking] Erro crítico:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
