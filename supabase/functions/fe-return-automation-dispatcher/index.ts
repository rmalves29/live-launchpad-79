// Dispatcher (cron) da automação de retorno.
// A cada execução:
//   1. Marca como 'expired' pendências vencidas.
//   2. Pega pendências scheduled com invite_send_at <= now() e dispara o
//      convite privado no WhatsApp, movendo para status = 'invited'.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limit: 1 mensagem a cada 5s. Cron roda a cada 1min → processamos até 12 por execução.
const BATCH = 12;
const RATE_LIMIT_MS = 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fillVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nowIso = new Date().toISOString();
  let expired = 0;
  let invited = 0;
  let failed = 0;

  try {
    // Expirar convites/vencidos
    const { data: expiredRows } = await supabase
      .from("fe_return_pending")
      .update({ status: "expired" })
      .in("status", ["scheduled", "invited"])
      .lt("expires_at", nowIso)
      .select("id");
    expired = expiredRows?.length || 0;

    // Buscar convites prontos para envio
    const { data: due } = await supabase
      .from("fe_return_pending")
      .select("id, tenant_id, automation_id, group_id, group_jid, phone")
      .eq("status", "scheduled")
      .lte("invite_send_at", nowIso)
      .limit(BATCH);

    for (const p of due || []) {
      try {
        const [{ data: a }, { data: g }, { data: cust }] = await Promise.all([
          supabase
            .from("fe_return_automations")
            .select("invite_message, is_active")
            .eq("id", p.automation_id)
            .maybeSingle(),
          p.group_id
            ? supabase
                .from("fe_groups")
                .select("group_name, invite_link")
                .eq("id", p.group_id)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
          supabase
            .from("customers")
            .select("name")
            .eq("tenant_id", p.tenant_id)
            .eq("phone", p.phone)
            .maybeSingle(),
        ]);

        if (!a || !a.is_active) {
          await supabase
            .from("fe_return_pending")
            .update({ status: "cancelled", error_message: "automation inactive" })
            .eq("id", p.id);
          continue;
        }

        const msg = fillVars(a.invite_message || "", {
          nome: (cust as any)?.name || "",
          grupo: (g as any)?.group_name || "",
          link_grupo: (g as any)?.invite_link || "",
        });

        const { error: sendErr } = await supabase.functions.invoke(
          "zapi-send-message",
          { body: { tenant_id: p.tenant_id, phone: p.phone, message: msg } },
        );

        if (sendErr) throw sendErr;

        await supabase
          .from("fe_return_pending")
          .update({ status: "invited", invite_sent_at: new Date().toISOString() })
          .eq("id", p.id);
        invited++;
      } catch (e: any) {
        failed++;
        await supabase
          .from("fe_return_pending")
          .update({ status: "failed", error_message: String(e?.message || e).slice(0, 500) })
          .eq("id", p.id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, expired, invited, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[fe-return-automation-dispatcher] fatal:", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message, expired, invited, failed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
