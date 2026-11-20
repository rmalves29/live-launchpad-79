// System Health Check — alertas do super admin (sininho no topo do sistema).
// Roda a cada 15 min via cron. Avalia as regras (_shared/health-rules.ts) e grava o estado em system_alerts:
// abre/atualiza o que está acontecendo agora e marca como resolvido o que sumiu.
// NÃO envia nada por WhatsApp (decisão do Rafael, 20/11/2026): o admin vê os alertas no sininho.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { evaluateHealth } from "../_shared/health-rules.ts";
import { syncSystemAlerts } from "../_shared/system-alerts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Sem trava de acesso de propósito: o cron chama sem chave. A função só lê e atualiza o próprio quadro de alertas.
  try {
    const alerts = await evaluateHealth(supabase);
    const result = await syncSystemAlerts(supabase, alerts);
    return new Response(JSON.stringify({ success: true, evaluated: alerts.length, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[system-health-check] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e?.message || e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
