// Roda a cada minuto: alerta o aprovador 5 min antes e manda o link ao lead no horário da reunião.
// Idempotente: cada envio é "reservado" com update condicional antes de mandar.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { formatBrt } from "../_shared/affiliate-agenda.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ORDERZAP_TENANT_ID = "d5671cfb-9c42-4c44-8f94-0a19a39473d8";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function send(phone: string | null, message: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return "telefone inválido";
  const { data, error } = await sb.functions.invoke("zapi-send-message", { body: { tenant_id: ORDERZAP_TENANT_ID, phone: digits, message } });
  if (error) return error.message;
  return data?.error ? String(data.error) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  let alerts = 0, links = 0;
  try {
    const { data: appr } = await sb.from("app_settings").select("onboarding_approver_phone").limit(1).maybeSingle();
    const approver = String(appr?.onboarding_approver_phone || "").replace(/\D/g, "");

    // 1) alerta 5 min antes (janela: começa em até 5 min e ainda não começou)
    const { data: soon } = await sb.from("platform_affiliate_leads")
      .update({ alert_sent_at: iso(now) })
      .eq("status", "reuniao_agendada").is("alert_sent_at", null)
      .gt("meeting_at", iso(now)).lte("meeting_at", iso(now + 5 * 60e3))
      .select("id, nome, empresa, whatsapp, instagram, meeting_at, meeting_link, affiliate_id");
    for (const l of soon || []) {
      if (!approver) { console.warn("[reminders] sem número aprovador"); break; }
      let afName = "";
      if (l.affiliate_id) afName = (await sb.from("platform_affiliates").select("nome").eq("id", l.affiliate_id).maybeSingle()).data?.nome || "";
      const err = await send(approver, `⏰ Reunião em 5 minutos (${formatBrt(l.meeting_at)})\n${l.nome} · ${l.empresa || "-"}\nWhatsApp: ${l.whatsapp || "-"}` +
        (l.instagram ? `\nInstagram: @${l.instagram}` : "") + (afName ? `\nIndicação: ${afName}` : "") + `\n${l.meeting_link || "Sem link do Meet (Google Agenda não conectado)"}`);
      if (err) console.error("[reminders] alerta:", err); else alerts++;
    }

    // 2) link do Meet ao lead no horário (até 30 min de atraso)
    const { data: due } = await sb.from("platform_affiliate_leads")
      .update({ link_sent_at: iso(now) })
      .eq("status", "reuniao_agendada").is("link_sent_at", null)
      .lte("meeting_at", iso(now)).gt("meeting_at", iso(now - 30 * 60e3))
      .select("id, nome, whatsapp, meeting_link");
    for (const l of due || []) {
      if (!l.meeting_link) continue;
      const err = await send(l.whatsapp, `Olá, ${String(l.nome).split(" ")[0]}! Nossa reunião começa agora 🙂\nEntre por aqui: ${l.meeting_link}`);
      if (err) console.error("[reminders] link:", err); else links++;
    }
    return new Response(JSON.stringify({ success: true, alerts, links }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[reminders]", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
