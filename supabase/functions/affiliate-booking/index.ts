// Programa de afiliados: agenda pública (/indicacao), indicação pelo painel do afiliado e gestão de reuniões no admin.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { formatBrt, isValidSlot, listSlots, normalizeAgenda } from "../_shared/affiliate-agenda.ts";
import { createMeetEvent, deleteEvent, googleConfigured, moveEvent } from "../_shared/google-calendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ORDERZAP_TENANT_ID = "d5671cfb-9c42-4c44-8f94-0a19a39473d8";
const SITE = "https://app.cartzy.com.br";
const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
const s = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

let DRY = false; // testes: sem WhatsApp real e sem evento real

async function sendWhatsApp(phone: string | null, message: string): Promise<string | null> {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return "telefone inválido";
  if (DRY) { console.log("[affiliate-booking] DRY whatsapp", digits.slice(-4)); return null; }
  const { data, error } = await sb.functions.invoke("zapi-send-message", { body: { tenant_id: ORDERZAP_TENANT_ID, phone: digits, message } });
  if (error) return error.message;
  if (data?.error) return String(data.error);
  if (data?.sent === false || data?.success === false) return "envio recusado";
  return null;
}

async function approvedByCode(codigo: unknown) {
  const c = s(codigo, 30).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return null;
  const { data } = await sb.from("platform_affiliates").select("id, nome, codigo").eq("codigo", c).eq("status", "aprovado").maybeSingle();
  return data;
}

async function agenda() {
  const { data } = await sb.from("platform_affiliate_settings").select("agenda").eq("id", 1).maybeSingle();
  return normalizeAgenda(data?.agenda);
}

async function bookedSlots() {
  const { data } = await sb.from("platform_affiliate_leads").select("meeting_at")
    .eq("status", "reuniao_agendada").gte("meeting_at", new Date().toISOString());
  return (data || []).map((r: any) => r.meeting_at as string);
}

/** Cria/move o evento no Google; sem Google conectado a reunião fica salva e o admin vê o aviso. */
async function syncGoogle(lead: any, minutes: number) {
  if (DRY) return { link: lead.meeting_link ?? null, error: null };
  if (!googleConfigured()) {
    await sb.from("platform_affiliate_leads").update({ google_error: "Google Agenda não conectado" }).eq("id", lead.id);
    return { link: null, error: "Google Agenda não conectado" };
  }
  try {
    if (lead.google_event_id) {
      await moveEvent(lead.google_event_id, lead.meeting_at, minutes);
      await sb.from("platform_affiliate_leads").update({ google_error: null }).eq("id", lead.id);
      return { link: lead.meeting_link, error: null };
    }
    const ev = await createMeetEvent({
      summary: `Cartzy · ${lead.empresa || lead.nome}`,
      description: `Lead: ${lead.nome}\nEmpresa: ${lead.empresa || "-"}\nWhatsApp: ${lead.whatsapp || "-"}\nInstagram: ${lead.instagram ? "@" + lead.instagram : "-"}\nVende em live: ${lead.vende_live ? "sim" : "não"}`,
      start: lead.meeting_at, minutes,
    });
    await sb.from("platform_affiliate_leads").update({ google_event_id: ev.id, meeting_link: ev.link, google_error: null }).eq("id", lead.id);
    return { link: ev.link, error: null };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error("[affiliate-booking] google:", msg);
    await sb.from("platform_affiliate_leads").update({ google_error: msg }).eq("id", lead.id);
    return { link: null, error: msg };
  }
}

/** Marca o horário (constraint única impede dois no mesmo slot). */
async function setMeeting(leadId: string, at: string): Promise<{ lead?: any; error?: string }> {
  const { data, error } = await sb.from("platform_affiliate_leads")
    .update({ meeting_at: at, status: "reuniao_agendada" }).eq("id", leadId).select("*").single();
  if (error) return { error: error.code === "23505" ? "Esse horário acabou de ser reservado. Escolha outro." : "Não foi possível agendar agora" };
  return { lead: data };
}

const confirmText = (nome: string, at: string, link: string | null) =>
  `Olá, ${nome.split(" ")[0]}! ✅ Sua reunião com a Cartzy está confirmada para ${formatBrt(at)} (horário de Brasília), com duração de 30 minutos.` +
  (link ? `\n\nLink da reunião: ${link}` : `\n\nVocê vai receber o link da reunião aqui no horário marcado.`);

async function authUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data } = await createClient(url, anonKey, { global: { headers: { Authorization: auth } } }).auth.getUser();
  return data?.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = s(body?.action, 30);
    DRY = body?.dry_run === true && req.headers.get("Authorization") === `Bearer ${serviceKey}`;

    // ---------- público ----------
    if (action === "slots") {
      const a = await agenda();
      const aff = await approvedByCode(body.ref);
      return json({ success: true, slots: listSlots(a, new Date(), await bookedSlots()), affiliate: aff ? { nome: aff.nome, codigo: aff.codigo } : null });
    }

    if (action === "book") {
      const nome = s(body.nome, 120), empresa = s(body.empresa, 120), whatsapp = s(body.whatsapp, 30), instagram = s(body.instagram, 120);
      const at = s(body.meeting_at, 40);
      if (!nome || !empresa || whatsapp.replace(/\D/g, "").length < 10) return json({ success: false, error: "Informe nome, empresa e WhatsApp com DDD" });
      const a = await agenda();
      if (!isValidSlot(a, new Date(), at)) return json({ success: false, error: "Horário indisponível. Escolha outro." });
      const aff = await approvedByCode(body.ref);
      const { data: reg, error: rErr } = await sb.rpc("platform_lead_register", {
        _affiliate_id: aff?.id ?? null, _nome: nome, _empresa: empresa, _whatsapp: whatsapp, _instagram: instagram,
        _vende_live: typeof body.vende_live === "boolean" ? body.vende_live : null, _origem: "landing", _notas: null,
      });
      if (rErr || !reg?.ok) return json({ success: false, error: reg?.error || "Não foi possível enviar agora" });
      const slotIso = new Date(at).toISOString();
      const r = await setMeeting(reg.lead_id, slotIso);
      if (r.error) return json({ success: false, error: r.error });
      const g = await syncGoogle(r.lead, a.duracao);
      const wErr = await sendWhatsApp(r.lead.whatsapp, confirmText(nome, slotIso, g.link));
      if (wErr) console.warn("[affiliate-booking] confirmação WhatsApp:", wErr);
      return json({ success: true, meeting_at: slotIso, lead_id: DRY ? reg.lead_id : undefined, whatsapp_sent: !wErr });
    }

    // ---------- afiliado ----------
    if (action === "indicate") {
      const user = await authUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: aff } = await sb.from("platform_affiliates").select("id, nome, codigo, status").eq("user_id", user.id).maybeSingle();
      if (!aff) return json({ success: false, error: "Afiliado não encontrado" });
      if (aff.status !== "aprovado") return json({ success: false, error: "Seu cadastro ainda não foi aprovado" });
      const nome = s(body.nome, 120), empresa = s(body.empresa, 120), whatsapp = s(body.whatsapp, 30);
      if (!nome || whatsapp.replace(/\D/g, "").length < 10) return json({ success: false, error: "Informe nome e WhatsApp com DDD" });
      const { data: reg, error } = await sb.rpc("platform_lead_register", {
        _affiliate_id: aff.id, _nome: nome, _empresa: empresa, _whatsapp: whatsapp, _instagram: s(body.instagram, 120),
        _vende_live: null, _origem: "afiliado", _notas: s(body.observacao, 1000) || null,
      });
      if (error) return json({ success: false, error: "Não foi possível salvar agora" });
      if (!reg?.ok) return json({ success: false, error: reg?.error || "Não foi possível salvar" }); // sem revelar quem indicou
      let sent: boolean | null = null;
      if (body.send_link === true) {
        const msg = `Oi, ${nome.split(" ")[0]}! Aqui é da Cartzy 👋 ${aff.nome.split(" ")[0]} indicou você. ` +
          `Escolha o melhor horário para uma conversa rápida de 30 minutos: ${SITE}/i/${aff.codigo}`;
        sent = !(await sendWhatsApp(whatsapp, msg));
      }
      return json({ success: true, lead_id: DRY ? reg.lead_id : undefined, whatsapp_sent: sent });
    }

    // ---------- super_admin ----------
    const user = DRY ? { id: "dry" } : await authUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (!DRY) {
      const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (prof?.role !== "super_admin") return json({ error: "Forbidden" }, 403);
    }

    if (action === "google_status") return json({ success: true, connected: googleConfigured() });

    const leadId = s(body.lead_id, 40);
    const { data: lead } = await sb.from("platform_affiliate_leads").select("*").eq("id", leadId).maybeSingle();
    if (!lead) return json({ success: false, error: "Lead não encontrado" });
    const a = await agenda();

    if (action === "admin_reschedule") {
      const t = new Date(s(body.meeting_at, 40));
      if (isNaN(t.getTime()) || t.getTime() < Date.now()) return json({ success: false, error: "Escolha um horário futuro" });
      const r = await setMeeting(lead.id, t.toISOString());
      if (r.error) return json({ success: false, error: r.error });
      const g = await syncGoogle(r.lead, a.duracao);
      const wErr = await sendWhatsApp(lead.whatsapp, `Olá, ${lead.nome.split(" ")[0]}! Sua reunião com a Cartzy foi remarcada para ${formatBrt(t.toISOString())} (horário de Brasília).` +
        (g.link ? `\n\nLink: ${g.link}` : ""));
      return json({ success: true, google_error: g.error, whatsapp_sent: !wErr });
    }

    if (action === "admin_cancel") {
      if (lead.google_event_id && !DRY && googleConfigured()) {
        try { await deleteEvent(lead.google_event_id); } catch (e) { console.error("[affiliate-booking] delete:", (e as Error).message); }
      }
      await sb.from("platform_affiliate_leads").update({
        status: "indicado", meeting_at: null, meeting_link: null, google_event_id: null, google_error: null,
      }).eq("id", lead.id);
      if (lead.meeting_at && new Date(lead.meeting_at).getTime() > Date.now() && body.notify !== false) {
        await sendWhatsApp(lead.whatsapp, `Olá, ${lead.nome.split(" ")[0]}! Sua reunião com a Cartzy de ${formatBrt(lead.meeting_at)} foi cancelada. Se quiser, é só responder aqui para marcarmos outro horário.`);
      }
      return json({ success: true });
    }

    if (action === "admin_retry_google") {
      if (!lead.meeting_at || lead.status !== "reuniao_agendada") return json({ success: false, error: "Lead sem reunião agendada" });
      const g = await syncGoogle(lead, a.duracao);
      return json(g.error ? { success: false, error: g.error } : { success: true, link: g.link });
    }

    return json({ success: false, error: "ação inválida" }, 400);
  } catch (e) {
    console.error("[affiliate-booking]", e);
    return json({ success: false, error: "erro interno" });
  }
});
