import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";
const ZAPI_TIMEOUT_MS = 8000;
const BATCH_DELAY_MS = 200;
const MAX_BATCH = 200;

interface CheckRequest {
  tenant_id: string;
  message_id?: string;
  phone?: string;
  hours?: number;
  limit?: number;
}

interface ZapiCreds {
  instanceId: string;
  token: string;
  clientToken: string;
}

async function getZAPICredentials(supabase: any, tenantId: string): Promise<ZapiCreds | null> {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data?.zapi_instance_id || !data?.zapi_token) return null;
  return {
    instanceId: data.zapi_instance_id,
    token: data.zapi_token,
    clientToken: data.zapi_client_token || "",
  };
}

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

interface NormalizedStatus {
  zapi_accepted: boolean;
  zapi_status: string;            // SENT | RECEIVED | READ | PLAYED | REJECTED | UNKNOWN
  delivered: boolean;
  read: boolean;
  rejected: boolean;
  moment_sent: number | null;
  moment_delivered: number | null;
  moment_read: number | null;
  raw: any;
  http_status: number;
  error?: string;
}

async function checkOneMessage(
  creds: ZapiCreds,
  messageId: string,
  phone?: string
): Promise<NormalizedStatus> {
  const baseUrl = `${ZAPI_BASE_URL}/instances/${creds.instanceId}/token/${creds.token}`;
  // Z-API endpoint: GET /message-status/{messageId}?phone={phone}
  const url = phone
    ? `${baseUrl}/message-status/${encodeURIComponent(messageId)}?phone=${encodeURIComponent(phone)}`
    : `${baseUrl}/message-status/${encodeURIComponent(messageId)}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (creds.clientToken) headers["Client-Token"] = creds.clientToken;

  try {
    const res = await fetchWithTimeout(url, { method: "GET", headers }, ZAPI_TIMEOUT_MS);
    const text = await res.text();
    let raw: any = null;
    try { raw = text ? JSON.parse(text) : null; } catch { raw = { _text: text }; }

    if (!res.ok) {
      return {
        zapi_accepted: false,
        zapi_status: "UNKNOWN",
        delivered: false,
        read: false,
        rejected: false,
        moment_sent: null,
        moment_delivered: null,
        moment_read: null,
        raw,
        http_status: res.status,
        error: typeof raw?.error === "string" ? raw.error : `HTTP ${res.status}`,
      };
    }

    // Possible Z-API shapes:
    //   { status: "SENT" | "RECEIVED" | "READ" | "PLAYED", momment / momments... }
    //   { status: { ... } } or array
    // Be defensive.
    const node = Array.isArray(raw) ? raw[0] : raw;
    const statusRaw =
      (node?.status && typeof node.status === "string" ? node.status : null) ||
      node?.status?.status ||
      node?.messageStatus ||
      "UNKNOWN";
    const status = String(statusRaw).toUpperCase();

    const moments = node?.momments || node?.moments || node?.status?.momments || {};
    const momentSent = node?.momment ?? node?.moment ?? moments.sent ?? null;
    const momentDelivered = moments.delivered ?? node?.deliveredAt ?? null;
    const momentRead = moments.read ?? moments.played ?? node?.readAt ?? null;

    const rejected =
      status === "REJECTED" ||
      status === "FAILED" ||
      String(node?.notification || "").toLowerCase().includes("rejected") ||
      String(node?.error || "").toLowerCase().includes("rejected");

    const delivered = ["RECEIVED", "READ", "PLAYED", "DELIVERED"].includes(status) || !!momentDelivered;
    const read = ["READ", "PLAYED"].includes(status) || !!momentRead;

    return {
      zapi_accepted: !rejected,
      zapi_status: rejected ? "REJECTED" : status,
      delivered,
      read,
      rejected,
      moment_sent: momentSent,
      moment_delivered: momentDelivered,
      moment_read: momentRead,
      raw,
      http_status: res.status,
    };
  } catch (err: any) {
    return {
      zapi_accepted: false,
      zapi_status: "UNKNOWN",
      delivered: false,
      read: false,
      rejected: false,
      moment_sent: null,
      moment_delivered: null,
      moment_read: null,
      raw: null,
      http_status: 0,
      error: err?.name === "AbortError" ? "timeout" : (err?.message || "fetch_error"),
    };
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body: CheckRequest = await req.json().catch(() => ({} as CheckRequest));
    const { tenant_id, message_id, phone, hours, limit } = body;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id é obrigatório" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!message_id && !phone && !hours) {
      return new Response(
        JSON.stringify({ success: false, error: "Informe message_id OU phone OU hours" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const creds = await getZAPICredentials(supabase, tenant_id);
    if (!creds) {
      return new Response(
        JSON.stringify({ success: false, error: "Z-API não configurada para este tenant" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ MODO A: messageId específico ============
    if (message_id) {
      console.log(`[zapi-check-message-status] MODE_A tenant=${tenant_id} mid=${message_id}`);
      const result = await checkOneMessage(creds, message_id, phone);
      return new Response(
        JSON.stringify({
          success: true,
          mode: "single",
          message_id,
          phone: phone || null,
          ...result,
          elapsed_ms: Date.now() - t0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ MODO B / C: lote por intervalo (e opcionalmente por phone) ============
    const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), MAX_BATCH);
    const since = new Date(Date.now() - safeHours * 3600 * 1000).toISOString();

    let q = supabase
      .from("whatsapp_messages")
      .select("id, phone, type, message, sent_at, created_at, zapi_message_id")
      .eq("tenant_id", tenant_id)
      .not("zapi_message_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (phone) {
      const cleaned = phone.replace(/\D/g, "");
      q = q.eq("phone", cleaned);
    }

    const { data: rows, error: qErr } = await q;
    if (qErr) {
      console.error(`[zapi-check-message-status] DB error:`, qErr.message);
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao consultar mensagens: ${qErr.message}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messages = rows || [];
    console.log(`[zapi-check-message-status] MODE_B tenant=${tenant_id} hours=${safeHours} limit=${safeLimit} found=${messages.length}`);

    const details: any[] = [];
    let acceptedOnly = 0;
    let delivered = 0;
    let read = 0;
    let rejected = 0;
    let unknown = 0;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const status = await checkOneMessage(creds, m.zapi_message_id, m.phone);
      const bucket = status.rejected
        ? "rejected_by_whatsapp"
        : status.read
          ? "read"
          : status.delivered
            ? "delivered"
            : status.zapi_status === "UNKNOWN"
              ? "unknown"
              : "accepted_only";

      if (bucket === "accepted_only") acceptedOnly++;
      else if (bucket === "delivered") delivered++;
      else if (bucket === "read") read++;
      else if (bucket === "rejected_by_whatsapp") rejected++;
      else unknown++;

      details.push({
        whatsapp_messages_id: m.id,
        message_id: m.zapi_message_id,
        phone: m.phone,
        type: m.type,
        created_at: m.created_at,
        sent_at: m.sent_at,
        bucket,
        zapi_status: status.zapi_status,
        delivered: status.delivered,
        read: status.read,
        rejected: status.rejected,
        error: status.error,
      });

      if (i < messages.length - 1) await sleep(BATCH_DELAY_MS);
    }

    const total = messages.length;
    const summary = {
      total_checked: total,
      accepted_only: acceptedOnly,
      delivered,
      read,
      rejected_by_whatsapp: rejected,
      unknown,
      delivery_rate_pct: total ? Math.round(((delivered + read) / total) * 1000) / 10 : 0,
      acceptance_only_pct: total ? Math.round((acceptedOnly / total) * 1000) / 10 : 0,
    };

    console.log(`[zapi-check-message-status] DONE tenant=${tenant_id} ${JSON.stringify(summary)}`);

    return new Response(
      JSON.stringify({
        success: true,
        mode: phone ? "by_phone" : "audit",
        tenant_id,
        hours: safeHours,
        phone_filter: phone || null,
        ...summary,
        details,
        elapsed_ms: Date.now() - t0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[zapi-check-message-status] FATAL:`, err?.message);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "internal_error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
