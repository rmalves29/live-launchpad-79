// uazapi webhook handler — entry point for events sent by uazapi to our backend.
// IMPORTANT: this is a Phase-1 minimal handler. It logs incoming events and
// persists incoming messages into whatsapp_messages. Group/consent/cart logic
// will be ported from evolution-webhook in a follow-up iteration once we see
// real uazapi payloads in production.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function phoneFromJid(jid: string): string {
  return String(jid || "").split("@")[0];
}

function isGroupJid(jid: string): boolean {
  return String(jid || "").includes("@g.us");
}

function extractText(data: any): string {
  if (!data) return "";
  // uazapi normaliza muito da estrutura: tenta vários caminhos comuns
  return (
    data?.text ||
    data?.message?.text ||
    data?.message?.conversation ||
    data?.body ||
    data?.content?.text ||
    data?.caption ||
    ""
  ).toString().trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json().catch(() => ({}));
    const event: string = payload?.event || payload?.type || "unknown";
    const instanceToken: string | undefined =
      payload?.token || payload?.instance?.token || req.headers.get("token") || undefined;
    const instanceName: string | undefined = payload?.instance?.name || payload?.instance_name;

    console.log(`[uazapi-webhook] event=${event} instance=${instanceName} token=${instanceToken?.slice(0, 8)}...`);

    // Resolver tenant pela combinação de token de instância
    let tenantId: string | null = null;
    if (instanceToken) {
      const { data: integ } = await supabase
        .from("integration_whatsapp")
        .select("tenant_id")
        .eq("uazapi_token", instanceToken)
        .maybeSingle();
      if (integ?.tenant_id) tenantId = integ.tenant_id;
    }

    if (!tenantId) {
      console.warn("[uazapi-webhook] tenant não identificado pelo token. Salvando como orfão.");
      try {
        await supabase.from("whatsapp_webhook_orphans").insert({
          payload,
          received_at: new Date().toISOString(),
        });
      } catch (_) { /* tabela pode não aceitar — ignore */ }
      return json({ ok: true, warning: "tenant não identificado" });
    }

    const data = payload?.data || payload?.message || payload;

    // Eventos de conexão — atualizar connected_phone / last_status_check
    if (event === "connection" || event === "connection_update" || data?.status) {
      const status = data?.status || payload?.status;
      const phone = data?.owner || data?.wid || data?.phoneconnected;
      const updates: Record<string, unknown> = { last_status_check: new Date().toISOString() };
      if (phone) updates.connected_phone = String(phone).replace(/@.*/, "");
      await supabase.from("integration_whatsapp").update(updates).eq("tenant_id", tenantId);

      try {
        await supabase.from("whatsapp_connection_logs").insert({
          tenant_id: tenantId,
          status,
          metadata: { event, payload: data },
        });
      } catch (_) { /* ignore */ }
      return json({ ok: true, handled: "connection" });
    }

    // Eventos de mensagem
    if (event === "messages" || event === "messages.upsert" || event === "message" || data?.text || data?.message) {
      const remoteJid: string = data?.chatid || data?.key?.remoteJid || data?.from || data?.sender || "";
      const fromMe: boolean = !!(data?.fromMe || data?.fromme || data?.key?.fromMe);
      const text = extractText(data);
      const messageId: string = data?.id || data?.messageid || data?.key?.id || crypto.randomUUID();
      const phone = phoneFromJid(remoteJid);

      try {
        await supabase.from("whatsapp_messages").insert({
          tenant_id: tenantId,
          phone,
          message: (text || "[mídia]").substring(0, 1000),
          type: fromMe ? "outgoing" : "incoming",
          zapi_message_id: messageId,
          delivery_status: fromMe ? "SENT" : "RECEIVED",
          created_at: new Date().toISOString(),
        });
      } catch (e: any) {
        console.warn("[uazapi-webhook] insert whatsapp_messages erro:", e.message);
      }

      // TODO Phase 2: portar lógica de consentimento, grupos, carrinho, sorteio,
      // reconhecimento de código de produto (regex C123x2), etc. do
      // evolution-webhook anterior usando payloads reais da uazapi.

      return json({ ok: true, handled: "message", fromMe, isGroup: isGroupJid(remoteJid) });
    }

    return json({ ok: true, handled: "ignored", event });
  } catch (e: any) {
    console.error("[uazapi-webhook] erro fatal:", e.message);
    return json({ ok: false, error: e.message }, 200);
  }
});
