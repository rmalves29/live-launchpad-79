// Edge function temporária para diagnosticar PIX no Mercado Pago de um tenant.
// Chama GET /v1/payment_methods com o token da loja e retorna métodos ativos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id");
    if (!tenantId) {
      return new Response(JSON.stringify({ success: false, error: "tenant_id obrigatório" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integ, error } = await sb
      .from("integration_mp")
      .select("access_token, is_active, environment, updated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !integ) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração MP não encontrada", details: error?.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mpRes = await fetch("https://api.mercadopago.com/v1/payment_methods", {
      headers: { Authorization: `Bearer ${integ.access_token}` },
    });
    const body = await mpRes.json();

    if (!mpRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Erro MP", status: mpRes.status, details: body }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const summary = (Array.isArray(body) ? body : []).map((p: any) => ({
      id: p.id,
      name: p.name,
      payment_type_id: p.payment_type_id,
      status: p.status,
    }));

    const pix = summary.filter((p) => p.id === "pix" || p.payment_type_id === "bank_transfer");
    const active = summary.filter((p) => p.status === "active");

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        is_active: integ.is_active,
        environment: integ.environment,
        total_methods: summary.length,
        active_count: active.length,
        pix_methods: pix,
        has_pix_active: pix.some((p) => p.status === "active"),
        all: summary,
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
