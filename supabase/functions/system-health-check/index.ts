// System Health Check — alertas para o super admin.
// Roda a cada 15 min via cron. Avalia as regras (_shared/health-rules.ts), registra em health_alerts_log e manda
// UMA mensagem de WhatsApp com os alertas novos para o telefone de alerta (app_settings.health_alert_phone).
// Remetente: sempre o WhatsApp da PLATAFORMA (ORDERZAP_TENANT_ID) — antes usava o da primeira loja com WhatsApp ativo,
// o que mandaria alerta interno pelo número de um cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ORDERZAP_TENANT_ID } from "../_shared/platform.ts";
import { evaluateHealth, formatAlertMessage } from "../_shared/health-rules.ts";

const COOLDOWN_HOURS = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Sem trava de acesso de propósito: o cron chama sem chave. A função só lê, responde contagens e
  // o cooldown impede que chamadas repetidas mandem a mesma mensagem.

  try {
    const alerts = await evaluateHealth(supabase);

    const { data: settings } = await supabase.from("app_settings").select("health_alert_phone").maybeSingle();
    const alertPhone = settings?.health_alert_phone?.trim() || null;

    // Cooldown: com telefone cadastrado, só conta o que de fato foi ENVIADO (alerta só registrado não bloqueia o envio).
    const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();
    let recentQ = supabase.from("health_alerts_log").select("rule_key").gt("sent_at", cooldownSince);
    if (alertPhone) recentQ = recentQ.not("sent_to", "is", null);
    const { data: recentAlerts } = await recentQ;
    const recentKeys = new Set((recentAlerts || []).map((r: any) => r.rule_key));
    const toSend = alerts.filter((a) => !recentKeys.has(a.key));

    let delivered = false;
    let sendError: string | null = null;
    if (alertPhone && toSend.length > 0) {
      const { data, error } = await supabase.functions.invoke("zapi-send-message", {
        body: { tenant_id: ORDERZAP_TENANT_ID, phone: alertPhone, message: formatAlertMessage(toSend) },
      });
      delivered = !error && (data as any)?.success !== false && !(data as any)?.error;
      if (!delivered) sendError = String(error?.message || (data as any)?.error || "falha no envio");
    }

    // Registra sempre (aparece no painel /admin/saude); sent_to só quando a mensagem saiu.
    for (const a of toSend) {
      await supabase.from("health_alerts_log").insert({
        rule_key: a.key,
        severity: a.severity,
        title: a.title,
        detail: { ...a.detail, ...(a.hint ? { hint: a.hint } : {}), ...(sendError ? { send_error: sendError } : {}) },
        sent_to: delivered ? alertPhone : null,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        evaluated: alerts.length,
        skipped_cooldown: alerts.length - toSend.length,
        sent: delivered ? toSend.length : 0,
        alert_phone_configured: !!alertPhone,
        send_error: sendError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[system-health-check] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e?.message || e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
