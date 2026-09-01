import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_LIMIT = 50;

// Reconciliação de postagem: consulta o status das etiquetas que ainda não foram
// marcadas como postadas (tracking_posted = false) e delega para a função da
// integração correspondente, que grava tracking_posted = true quando a
// transportadora confirmar a postagem. O trigger trg_send_tracking_whatsapp
// dispara o WhatsApp automaticamente nesse momento.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let filterTenantId: string | null = null;
    let filterOrderId: number | null = null;
    try {
      const body = await req.json();
      filterTenantId = body?.tenant_id || null;
      filterOrderId = Number.isFinite(Number(body?.order_id)) ? Number(body.order_id) : null;
    } catch { /* sem body */ }

    let query = supabase
      .from("orders")
      .select("id, tenant_id, melhor_envio_shipment_id")
      .not("melhor_envio_shipment_id", "is", null)
      .not("melhor_envio_tracking_code", "is", null)
      .eq("tracking_posted", false)
      .neq("is_cancelled", true)
      .order("id", { ascending: false })
      .limit(BATCH_LIMIT);

    if (filterTenantId) query = query.eq("tenant_id", filterTenantId);
    if (filterOrderId) query = query.eq("id", filterOrderId);

    const { data: orders, error } = await query;
    if (error) throw error;

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma etiqueta pendente de postagem", checked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[tracking-posted-sync] ${orders.length} etiquetas pendentes de postagem`);

    const results: any[] = [];

    for (const order of orders) {
      const shipmentId: string = order.melhor_envio_shipment_id || "";

      // Identificar o provedor pelo prefixo do shipment_id
      let fnName: string | null = null;
      let action: string | null = null;
      if (shipmentId.startsWith("mandae_")) {
        fnName = "mandae-labels";
        action = "get_tracking";
      } else if (shipmentId.startsWith("superfrete_")) {
        fnName = "superfrete-labels";
        action = "get_status";
      } else if (shipmentId.startsWith("frenet_")) {
        fnName = "frenet-labels";
        action = "get_tracking";
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shipmentId)) {
        // UUID = remessa do Melhor Envio (webhook é o caminho principal; isto é fallback)
        fnName = "melhor-envio-labels";
        action = "get_status";
      } else {
        // Correios CWS / MeusCorreios / outros: sem API de postagem — nada a fazer
        results.push({ order_id: order.id, skipped: true });
        continue;
      }

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ action, tenant_id: order.tenant_id, order_id: order.id }),
        });
        const text = await resp.text();
        console.log(`[tracking-posted-sync] Pedido ${order.id} via ${fnName}: HTTP ${resp.status}`);
        results.push({ order_id: order.id, provider: fnName, status: resp.status });
      } catch (e) {
        console.error(`[tracking-posted-sync] Erro no pedido ${order.id}:`, e);
        results.push({ order_id: order.id, provider: fnName, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: orders.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[tracking-posted-sync] Erro crítico:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
