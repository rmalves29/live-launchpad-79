import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGARME_API = "https://api.pagar.me/core/v5";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Não autenticado" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ success: false, error: "Usuário inválido" }, 200);

    const { subscription_id } = await req.json();
    if (!subscription_id) return json({ success: false, error: "subscription_id obrigatório" }, 200);

    const { data: row } = await supabase
      .from("subscription_recurrences")
      .select("*")
      .eq("id", subscription_id)
      .maybeSingle();

    if (!row) return json({ success: false, error: "Assinatura não encontrada" }, 200);

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .maybeSingle();

    const isSuper = profile?.role === "super_admin";
    const isOwner = profile?.tenant_id === row.tenant_id && (profile?.role === "tenant_admin" || isSuper);
    if (!isOwner && !isSuper) return json({ success: false, error: "Sem permissão" }, 200);

    const apiKey = Deno.env.get("PAGARME_ORDERZAP_API_KEY");
    if (!apiKey) return json({ success: false, error: "PAGARME_ORDERZAP_API_KEY não configurada" }, 200);
    const auth = "Basic " + btoa(`${apiKey}:`);

    if (row.pagarme_subscription_id) {
      const resp = await fetch(`${PAGARME_API}/subscriptions/${row.pagarme_subscription_id}`, {
        method: "DELETE",
        headers: { Authorization: auth, "Content-Type": "application/json" },
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error("[pagarme-cancel] erro:", resp.status, out);
        return json({ success: false, error: out?.message || "Erro ao cancelar na Pagar.me" }, 200);
      }
    }

    await supabase
      .from("subscription_recurrences")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        cancel_at: row.current_period_end,
      })
      .eq("id", subscription_id);

    return json({ success: true });
  } catch (err) {
    console.error("[pagarme-cancel] erro:", err);
    return json({ success: false, error: String(err?.message || err) }, 200);
  }
});
