// Varredura diária: produto excluído no Bling → desativado e com estoque zerado no Cartzy.
// Complementa o aviso product.deleted (que o Bling nem sempre envia).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sweepDeletedProducts, validToken } from "../_shared/bling-product-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { tenant_id } = await req.json().catch(() => ({}));
    let q = supabase.from("integration_bling").select("*").eq("is_active", true);
    if (tenant_id) q = q.eq("tenant_id", tenant_id);
    const { data: integs } = await q;
    const out: Record<string, unknown> = {};
    for (const integ of integs || []) {
      const token = await validToken(supabase, integ);
      if (!token) { out[integ.tenant_id] = "token_expirado"; continue; }
      out[integ.tenant_id] = await sweepDeletedProducts(supabase, integ, token);
    }
    return new Response(JSON.stringify({ ok: true, result: out }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[bling-sweep-deleted]", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
