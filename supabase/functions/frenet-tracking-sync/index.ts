import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cron job: percorre pedidos Frenet com envio pendente e atualiza rastreio
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: orders } = await supabase
      .from("orders")
      .select("id, tenant_id, melhor_envio_shipment_id, melhor_envio_tracking_code, observation, order_status")
      .like("melhor_envio_shipment_id", "frenet_%")
      .neq("order_status", "entregue")
      .limit(200);

    let processed = 0;
    let updated = 0;
    const results: any[] = [];

    for (const order of orders || []) {
      processed++;
      try {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/frenet-labels`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ action: "get_tracking", tenant_id: order.tenant_id, order_id: order.id }),
        });
        const data = await r.json();
        if (data?.success) {
          updated++;
          // Se algum evento indica entrega, marca order_status=entregue
          const events = data.tracking?.events || [];
          const delivered = events.some((e: any) =>
            String(e?.EventDescription || e?.description || "").toLowerCase().includes("entregue"),
          );
          if (delivered) {
            await supabase.from("orders").update({ order_status: "entregue" }).eq("id", order.id);
          }
        }
        results.push({ order_id: order.id, ok: !!data?.success });
      } catch (e: any) {
        results.push({ order_id: order.id, error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed, updated, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[frenet-tracking-sync] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
