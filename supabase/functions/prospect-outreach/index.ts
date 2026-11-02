import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getUazapiConfig, sendText, runTypingSegments, sendPresenceAvailable,
  ensureLabel, addChatLabel, archiveChat, findChat, type UazapiConfig,
} from "../_shared/uazapi-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ORDERZAP_TENANT_ID = "d5671cfb-9c42-4c44-8f94-0a19a39473d8";
const LABEL_NAME = "lead";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizePhone(p: unknown): string {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d && !d.startsWith("55") && (d.length === 10 || d.length === 11)) d = "55" + d;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profile?.role !== "super_admin") return json({ error: "Forbidden: super_admin role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const { cfg, error: cfgErr } = await getUazapiConfig(admin, ORDERZAP_TENANT_ID);
    if (!cfg) return json({ success: false, error: cfgErr || "Instância OrderZap indisponível" });

    // cache do id da etiqueta nesta execução
    // cache só do sucesso: falha tenta de novo no próximo telefone
    let cachedLabelId: string | null = null;
    const getLabel = async (): Promise<{ labelId?: string; error?: string }> => {
      if (cachedLabelId) return { labelId: cachedLabelId };
      const r = await ensureLabel(cfg, LABEL_NAME);
      if (r.labelId) cachedLabelId = r.labelId;
      return r;
    };

    const tagAndArchive = async (c: UazapiConfig, phone: string) => {
      const errors: string[] = [];
      // usa o chatid real se o /chat/find mostrar número diferente (com/sem 9)
      const before = await findChat(c, phone);
      const target = before.chatid ? before.chatid.split("@")[0] : phone;
      let labeled = false;
      const lbl = await getLabel();
      if (lbl.labelId) {
        const r = await addChatLabel(c, target, lbl.labelId);
        labeled = r.success;
        if (!r.success) errors.push(`etiqueta: ${r.error}`);
      } else errors.push(`etiqueta: ${lbl.error}`);
      let a = await archiveChat(c, target, true);
      if (!a.success) errors.push(`arquivar: ${a.error}`);
      await sleep(2000);
      let check = await findChat(c, target);
      if (!check.archived) {
        a = await archiveChat(c, target, true);
        if (!a.success) errors.push(`arquivar (2ª): ${a.error}`);
        await sleep(3000);
        check = await findChat(c, target);
      }
      if (!check.found) errors.push(`verificação: chat não encontrado no /chat/find${check.error ? ` (${check.error})` : ""}`);
      return {
        chatid_used: target, chatid_differs: target !== phone, labeled, archived: a.success,
        archived_verified: check.archived === true, labels: check.labels ?? null, errors,
      };
    };

    if (action === "send") {
      const phone = normalizePhone(body.phone);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (phone.length < 12 || !message) return json({ success: false, error: "phone e message são obrigatórios" }, 400);

      try { await runTypingSegments(cfg, phone, message.length); } catch { /* ignore */ }
      const sent = await sendText(cfg, phone, message);
      try { await sendPresenceAvailable(cfg, phone); } catch { /* ignore */ }
      try {
        await admin.from("whatsapp_messages").insert({
          tenant_id: ORDERZAP_TENANT_ID,
          phone,
          message: message.substring(0, 500),
          type: "outgoing",
          sent_at: new Date().toISOString(),
          zapi_message_id: sent.messageId ?? null,
          delivery_status: sent.success ? "SENT" : "FAILED",
        });
      } catch (e) { console.error("[prospect-outreach] log error", e); }

      if (!sent.success) return json({ success: false, sent: false, labeled: false, archived: false, errors: [`envio: ${sent.error}`] });
      await sleep(8000);
      const t = await tagAndArchive(cfg, phone);
      return json({ success: true, sent: true, ...t });
    }

    if (action === "tag_archive") {
      const phones: string[] = Array.isArray(body.phones) ? body.phones.map(normalizePhone).filter((p: string) => p.length >= 12) : [];
      if (!phones.length) return json({ success: false, error: "phones é obrigatório" }, 400);
      if (phones.length > 200) return json({ success: false, error: "máximo de 200 telefones" }, 400);
      const results: Record<string, unknown>[] = [];
      for (const phone of phones) results.push({ phone, ...(await tagAndArchive(cfg, phone)) });
      return json({ success: true, results });
    }

    if (action === "check") {
      const phones: string[] = Array.isArray(body.phones) ? body.phones.map(normalizePhone).filter((p: string) => p.length >= 12) : [];
      if (!phones.length) return json({ success: false, error: "phones é obrigatório" }, 400);
      if (phones.length > 200) return json({ success: false, error: "máximo de 200 telefones" }, 400);
      const results: Record<string, unknown>[] = [];
      for (const phone of phones) {
        const r = await findChat(cfg, phone);
        results.push({ phone, found: r.found, chatid: r.chatid ?? null, archived: r.archived ?? null, labels: r.labels ?? null, raw_resumido: r.raw ?? null, error: r.error });
      }
      return json({ success: true, results });
    }

    return json({ success: false, error: "action inválida (use send, tag_archive ou check)" }, 400);
  } catch (e: any) {
    console.error("[prospect-outreach]", e);
    return json({ success: false, error: e?.message || "erro interno" });
  }
});
