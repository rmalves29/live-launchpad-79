// Olist ERP (API v3): renova o token de todas as empresas que estão na hora. Chamada pelo agendamento (pg_cron) de 30 em 30 min.
// Cada empresa só é renovada quando next_refresh_at chegou (a cada 2 h; após falha, 15/30/60 min), então chamadas repetidas não fazem nada extra.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { refreshOlistToken } from "../_shared/olist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: due } = await supabase
      .from("integration_olist")
      .select("tenant_id")
      .eq("is_active", true)
      .not("refresh_token", "is", null)
      .or(`next_refresh_at.is.null,next_refresh_at.lte.${new Date().toISOString()}`)
      .order("next_refresh_at", { ascending: true, nullsFirst: true })
      .limit(50);

    const summary = { due: due?.length || 0, refreshed: 0, retry: 0, reauth: 0, busy: 0 };
    for (const r of due || []) {
      if (Date.now() - started > 100_000) break; // o resto fica para a próxima rodada
      const out = await refreshOlistToken(supabase, r.tenant_id);
      if (out.action === "refreshed") summary.refreshed++;
      else if (out.action === "reauth") summary.reauth++;
      else if (out.action === "busy") summary.busy++;
      else summary.retry++;
      await new Promise((ok) => setTimeout(ok, 300));
    }
    console.log("[olist-refresh-tokens]", JSON.stringify(summary));
    return new Response(JSON.stringify({ success: true, ...summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[olist-refresh-tokens]", (e as Error).message);
    return new Response(JSON.stringify({ success: false, error: "erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
