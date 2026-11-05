// Acesso do agente de prospecção local (adaptação do Harvey) ao WhatsApp da OrderZap.
// Autenticação: cabeçalho x-agent-key = segredo PROSPECT_AGENT_KEY (definido pelo Rafael nos Secrets).
// Ações: status, send, replies, opt_out.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addChatLabel, ensureLabel, getInstanceStatus, getUazapiConfig, runTypingSegments, sendPresenceAvailable, sendText,
} from "../_shared/uazapi-api.ts";

const ORDERZAP_TENANT_ID = "d5671cfb-9c42-4c44-8f94-0a19a39473d8";
const LABEL_NAME = "lead";
const DAILY_CAP = Number(Deno.env.get("PROSPECT_AGENT_DAILY_CAP") || 50); // primeiras mensagens por dia
const QUIET_START = 20, QUIET_END = 8; // horário de Brasília: não envia das 20h às 8h

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function normalizePhone(p: unknown): string {
  let d = digits(p);
  if (d && !d.startsWith("55") && (d.length === 10 || d.length === 11)) d = "55" + d;
  return d;
}
/** DDD + 8 últimos dígitos: casa número com e sem o nono dígito. */
function phoneKey(p: unknown): string {
  let d = digits(String(p ?? "").split("@")[0]);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}
function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function brtHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(d));
}
function brtDayStartIso(d = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d); // AAAA-MM-DD
  return new Date(`${day}T00:00:00-03:00`).toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const expected = Deno.env.get("PROSPECT_AGENT_KEY") || "";
  if (!expected) return json({ error: "PROSPECT_AGENT_KEY não configurada no servidor" }, 503);
  if (!safeEqual(req.headers.get("x-agent-key") || "", expected)) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const { cfg, error: cfgErr } = await getUazapiConfig(admin, ORDERZAP_TENANT_ID);
    if (!cfg) return json({ success: false, error: cfgErr || "Instância OrderZap indisponível" });

    const sentToday = async () => {
      const { count } = await admin.from("prospect_leads").select("id", { count: "exact", head: true })
        .gte("enviado_em", brtDayStartIso()).eq("fonte", "agente");
      return count ?? 0;
    };

    if (action === "status") {
      const st = await getInstanceStatus(cfg);
      return json({ success: true, whatsapp: st, sent_today: await sentToday(), daily_cap: DAILY_CAP, quiet_hours: `${QUIET_START}h-${QUIET_END}h` });
    }

    if (action === "send") {
      // kind: "first" (primeira abordagem, conta no limite diário) | "reply" (resposta a quem já respondeu)
      const kind = body.kind === "reply" ? "reply" : "first";
      const phone = normalizePhone(body.phone);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (phone.length < 12 || !message) return json({ success: false, error: "phone e message são obrigatórios" }, 400);
      if (message.length > 1500) return json({ success: false, error: "mensagem longa demais" }, 400);
      // test=true: mensagem de teste do Rafael. Vale a qualquer hora, não conta no limite
      // diário e não registra o número como lead. O Harvey nunca manda esse campo.
      const isTest = body.test === true;
      const h = brtHour();
      if (!isTest && (h >= QUIET_START || h < QUIET_END)) return json({ success: false, error: "fora do horário de envio (8h às 20h)", retry: true });

      const key = phoneKey(phone);
      const { data: known } = await admin.from("prospect_leads").select("id, whatsapp, status");
      const same = (known || []).filter((l: any) => phoneKey(l.whatsapp) === key);
      if (same.some((l: any) => l.status === "descartado")) return json({ success: false, error: "contato pediu para não receber mensagens" });
      if (kind === "first" && !isTest) {
        if (same.some((l: any) => ["enviado"].includes(l.status))) return json({ success: false, error: "primeira mensagem já enviada para este número" });
        if ((await sentToday()) >= DAILY_CAP) return json({ success: false, error: `limite diário de ${DAILY_CAP} atingido`, retry: true });
      }

      try { await runTypingSegments(cfg, phone, message.length); } catch { /* ignore */ }
      const sent = await sendText(cfg, phone, message);
      try { await sendPresenceAvailable(cfg, phone); } catch { /* ignore */ }
      await admin.from("whatsapp_messages").insert({
        tenant_id: ORDERZAP_TENANT_ID, phone, message: message.substring(0, 500), type: "outgoing",
        sent_at: new Date().toISOString(), zapi_message_id: sent.messageId ?? null, delivery_status: sent.success ? "SENT" : "FAILED",
      });
      if (!sent.success) return json({ success: false, error: `envio: ${sent.error}` });

      if (kind === "first" && !isTest) {
        const lead = {
          handle: String(body.handle || "").slice(0, 80) || null,
          nome_loja: String(body.nome_loja || body.company || "").slice(0, 120) || null,
          segmento: String(body.segmento || "").slice(0, 60) || null,
          whatsapp: phone, fonte: "agente", status: "enviado",
          evidencia_live: String(body.evidencia || "").slice(0, 300) || null,
          lote_data: new Date().toISOString().slice(0, 10), aprovado_em: new Date().toISOString(), enviado_em: new Date().toISOString(),
        };
        if (same.length) await admin.from("prospect_leads").update({ status: "enviado", enviado_em: lead.enviado_em, fonte: "agente" }).eq("id", same[0].id);
        else {
          const ins = await admin.from("prospect_leads").insert(lead);
          if (ins.error?.code === "23505") await admin.from("prospect_leads").insert({ ...lead, handle: null }); // @ já usado por outro número
        }
        try {
          const lbl = await ensureLabel(cfg, LABEL_NAME);
          if (lbl.labelId) await addChatLabel(cfg, phone, lbl.labelId);
        } catch { /* etiqueta é opcional */ }
      }
      return json({ success: true, message_id: sent.messageId ?? null });
    }

    if (action === "replies") {
      // Respostas recebidas no WhatsApp da OrderZap, só de números que o agente abordou.
      const since = body.since ? new Date(body.since) : new Date(Date.now() - 24 * 3600e3);
      if (isNaN(since.getTime())) return json({ success: false, error: "since inválido" }, 400);
      const { data: leads } = await admin.from("prospect_leads").select("whatsapp, nome_loja, handle, enviado_em").in("status", ["enviado", "descartado"]);
      const byKey = new Map((leads || []).map((l: any) => [phoneKey(l.whatsapp), l]));
      const { data: msgs, error } = await admin.from("whatsapp_messages")
        .select("id, phone, message, received_at, created_at, whatsapp_group_name")
        .eq("tenant_id", ORDERZAP_TENANT_ID).eq("type", "incoming").gt("created_at", since.toISOString())
        .order("created_at", { ascending: true }).limit(500);
      if (error) return json({ success: false, error: error.message });
      // Só conversa privada com a loja, depois da primeira mensagem: mensagens de grupo
      // (pedidos por código, "[WEBHOOK] Processado: ...") não são resposta à abordagem.
      const out = (msgs || []).filter((m: any) => {
        const l: any = byKey.get(phoneKey(m.phone));
        if (!l || m.whatsapp_group_name) return false;
        if (String(m.message || "").startsWith("[WEBHOOK]")) return false;
        if (l.enviado_em && new Date(m.created_at) < new Date(l.enviado_em)) return false;
        return true;
      }).map((m: any) => {
        const l: any = byKey.get(phoneKey(m.phone));
        return { id: String(m.id), phone: normalizePhone(l.whatsapp), text: m.message || "", at: m.received_at || m.created_at, nome_loja: l.nome_loja, handle: l.handle };
      });
      return json({ success: true, replies: out });
    }

    if (action === "opt_out") {
      const key = phoneKey(body.phone);
      if (key.length < 10) return json({ success: false, error: "phone inválido" }, 400);
      const { data: known } = await admin.from("prospect_leads").select("id, whatsapp");
      const ids = (known || []).filter((l: any) => phoneKey(l.whatsapp) === key).map((l: any) => l.id);
      if (ids.length) await admin.from("prospect_leads").update({ status: "descartado", erro: "pediu para sair" }).in("id", ids);
      else await admin.from("prospect_leads").insert({ whatsapp: normalizePhone(body.phone), fonte: "agente", status: "descartado", erro: "pediu para sair" });
      return json({ success: true });
    }

    return json({ success: false, error: "action inválida (status, send, replies, opt_out)" }, 400);
  } catch (e) {
    console.error("[prospect-agent]", e);
    return json({ success: false, error: (e as Error)?.message || "erro interno" });
  }
});
