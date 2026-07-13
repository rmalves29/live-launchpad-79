// System Health Check — Fase 5
// Roda a cada 15min via cron. Avalia regras de saúde e dispara alerta via WhatsApp (com cooldown).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const COOLDOWN_HOURS = 2;

interface AlertRule {
  key: string;
  title: string;
  detail: Record<string, unknown>;
  severity: "warn" | "error";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const alerts: AlertRule[] = [];

    // 1) Webhooks com > 20% erro na última hora
    const { data: whRows } = await supabase
      .from("webhook_logs")
      .select("webhook_type, status_code")
      .gt("created_at", new Date(Date.now() - 3600_000).toISOString());

    if (whRows && whRows.length > 0) {
      const byType = new Map<string, { total: number; err: number }>();
      for (const row of whRows) {
        const t = row.webhook_type || "desconhecido";
        const e = byType.get(t) || { total: 0, err: 0 };
        e.total += 1;
        if (!row.status_code || row.status_code >= 400) e.err += 1;
        byType.set(t, e);
      }
      for (const [type, stats] of byType) {
        if (stats.total >= 10 && stats.err / stats.total > 0.2) {
          alerts.push({
            key: `webhook_error_rate_${type}`,
            title: `⚠️ Webhook ${type}: ${((stats.err / stats.total) * 100).toFixed(0)}% de erro na última hora`,
            detail: { type, total: stats.total, errors: stats.err },
            severity: "error",
          });
        }
      }
    }

    // 2) Jobs de envio travados > 30min
    const { count: stuckJobs } = await supabase
      .from("sending_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "running")
      .lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString());
    if ((stuckJobs || 0) > 0) {
      alerts.push({
        key: "sending_jobs_stuck",
        title: `🔴 ${stuckJobs} job(s) de envio travado(s) há +30min`,
        detail: { count: stuckJobs },
        severity: "error",
      });
    }

    // 3) Sessões WhatsApp desconectadas (rastreio via whatsapp_active_sessions)
    const { count: disconnected } = await supabase
      .from("whatsapp_active_sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "disconnected");
    if ((disconnected || 0) > 0) {
      alerts.push({
        key: "whatsapp_disconnected",
        title: `📵 ${disconnected} instância(s) WhatsApp desconectada(s)`,
        detail: { count: disconnected },
        severity: "warn",
      });
    }

    // 4) Push campaigns incompletas > 2h
    const { count: pushStuck } = await supabase
      .from("push_campaigns")
      .select("*", { count: "exact", head: true })
      .in("status", ["queued", "running", "sending"])
      .lt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString());
    if ((pushStuck || 0) > 0) {
      alerts.push({
        key: "push_campaigns_stuck",
        title: `📮 ${pushStuck} campanha(s) push incompleta(s) há +2h`,
        detail: { count: pushStuck },
        severity: "warn",
      });
    }

    // Filtrar por cooldown
    const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();
    const { data: recentAlerts } = await supabase
      .from("health_alerts_log")
      .select("rule_key")
      .gt("sent_at", cooldownSince);
    const recentKeys = new Set((recentAlerts || []).map((r) => r.rule_key));

    const toSend = alerts.filter((a) => !recentKeys.has(a.key));

    // Obter telefone de alerta e tenant para envio
    const { data: settings } = await supabase
      .from("app_settings")
      .select("health_alert_phone")
      .maybeSingle();
    const alertPhone = settings?.health_alert_phone?.trim();

    let sentCount = 0;
    if (alertPhone && toSend.length > 0) {
      // Pega o primeiro tenant com WhatsApp ativo para usar como remetente
      const { data: waTenant } = await supabase
        .from("integration_whatsapp")
        .select("tenant_id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (waTenant?.tenant_id) {
        for (const alert of toSend) {
          const body = `🩺 *Saúde do Sistema — OrderZaps*\n\n${alert.title}\n\n_Regra: ${alert.key}_\n_${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}_`;
          try {
            await supabase.functions.invoke("zapi-send-message", {
              body: { tenant_id: waTenant.tenant_id, phone: alertPhone, message: body },
            });
            await supabase.from("health_alerts_log").insert({
              rule_key: alert.key,
              severity: alert.severity,
              title: alert.title,
              detail: alert.detail,
              sent_to: alertPhone,
            });
            sentCount++;
          } catch (e) {
            console.error(`[health-check] failed to send alert ${alert.key}:`, e);
          }
        }
      }
    } else if (toSend.length > 0) {
      // Registrar mesmo sem envio (para histórico)
      for (const alert of toSend) {
        await supabase.from("health_alerts_log").insert({
          rule_key: alert.key,
          severity: alert.severity,
          title: alert.title,
          detail: alert.detail,
          sent_to: null,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        evaluated: alerts.length,
        skipped_cooldown: alerts.length - toSend.length,
        sent: sentCount,
        alert_phone_configured: !!alertPhone,
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
