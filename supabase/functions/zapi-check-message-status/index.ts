import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * zapi-check-message-status
 *
 * IMPORTANTE: A Z-API (versão Multi-Device, que é a usada hoje) NÃO oferece
 * endpoint REST para consultar o status de uma mensagem por messageId.
 * A documentação oficial diz: "Este método não está disponível na versão
 * Multi Device, pois o Z-API não armazena as mensagens. A única maneira de
 * obter o status é via Webhook (DeliveryCallback / MessageStatusCallback)".
 *
 * Esta função, portanto, audita o GAP entre:
 *   - mensagens que o sistema marcou como enviadas (registradas com zapi_message_id)
 *   - mensagens para as quais a Z-API efetivamente confirmou entrega
 *     (delivery_status RECEIVED / READ / PLAYED via webhook)
 *
 * Tudo é leitura. Nada é gravado.
 */

interface CheckRequest {
  tenant_id: string;
  message_id?: string;
  phone?: string;
  hours?: number;
  limit?: number;
}

const DELIVERED_STATUSES = ["RECEIVED", "DELIVERED", "READ", "PLAYED"];
const READ_STATUSES = ["READ", "PLAYED"];
const FAILED_STATUSES = ["FAILED", "REJECTED", "ERROR"];

function classify(status: string | null) {
  const s = (status || "").toUpperCase();
  if (READ_STATUSES.includes(s)) return "read";
  if (DELIVERED_STATUSES.includes(s)) return "delivered";
  if (FAILED_STATUSES.includes(s)) return "rejected_by_whatsapp";
  if (s === "SENT" || s === "PENDING" || s === "" || s === "QUEUED") return "accepted_only";
  return "unknown";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    // ============ MODO A: messageId específico ============
    if (message_id) {
      const { data: row, error } = await supabase
        .from("whatsapp_messages")
        .select("id, tenant_id, phone, type, message, sent_at, created_at, zapi_message_id, delivery_status")
        .eq("tenant_id", tenant_id)
        .eq("zapi_message_id", message_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: `DB: ${error.message}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!row) {
        return new Response(
          JSON.stringify({
            success: true,
            mode: "single",
            message_id,
            found: false,
            note: "Nenhum registro com este zapi_message_id. Pode ser ID mismatch (callback usa zaapId diferente) ou mensagem nunca registrada.",
            elapsed_ms: Date.now() - t0,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const bucket = classify(row.delivery_status);
      return new Response(
        JSON.stringify({
          success: true,
          mode: "single",
          found: true,
          message_id,
          whatsapp_messages_id: row.id,
          phone: row.phone,
          type: row.type,
          created_at: row.created_at,
          sent_at: row.sent_at,
          delivery_status_db: row.delivery_status,
          interpretation: bucket,
          accepted_by_zapi: true, // tem zapi_message_id, então a Z-API aceitou
          delivered_to_handset: bucket === "delivered" || bucket === "read",
          read_by_recipient: bucket === "read",
          rejected_by_whatsapp: bucket === "rejected_by_whatsapp",
          note:
            bucket === "accepted_only"
              ? "Z-API aceitou mas o WhatsApp NUNCA confirmou entrega. Pode estar realmente entregue (e o webhook falhou em atualizar) ou pode estar realmente travada."
              : bucket === "delivered"
                ? "Entregue no aparelho do destinatário."
                : bucket === "read"
                  ? "Lida pelo destinatário."
                  : bucket === "rejected_by_whatsapp"
                    ? "WhatsApp REJEITOU a mensagem após aceite da Z-API."
                    : "Status indefinido.",
          elapsed_ms: Date.now() - t0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ MODO B / C: lote por intervalo ============
    const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
    const since = new Date(Date.now() - safeHours * 3600 * 1000).toISOString();

    let q = supabase
      .from("whatsapp_messages")
      .select("id, phone, type, sent_at, created_at, zapi_message_id, delivery_status")
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
      return new Response(
        JSON.stringify({ success: false, error: `DB: ${qErr.message}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messages = rows || [];
    const counts: Record<string, number> = {
      accepted_only: 0,
      delivered: 0,
      read: 0,
      rejected_by_whatsapp: 0,
      unknown: 0,
    };
    const samplePerBucket: Record<string, any[]> = {
      accepted_only: [],
      delivered: [],
      read: [],
      rejected_by_whatsapp: [],
      unknown: [],
    };

    for (const m of messages) {
      const bucket = classify(m.delivery_status);
      counts[bucket]++;
      if (samplePerBucket[bucket].length < 5) {
        samplePerBucket[bucket].push({
          whatsapp_messages_id: m.id,
          message_id: m.zapi_message_id,
          phone: m.phone,
          type: m.type,
          created_at: m.created_at,
          delivery_status_db: m.delivery_status,
        });
      }
    }

    const total = messages.length;
    const deliveryConfirmed = counts.delivered + counts.read;
    const summary = {
      total_checked: total,
      accepted_only: counts.accepted_only,
      delivered: counts.delivered,
      read: counts.read,
      rejected_by_whatsapp: counts.rejected_by_whatsapp,
      unknown: counts.unknown,
      delivery_confirmed_pct: total ? Math.round((deliveryConfirmed / total) * 1000) / 10 : 0,
      accepted_only_pct: total ? Math.round((counts.accepted_only / total) * 1000) / 10 : 0,
      diagnosis:
        total === 0
          ? "Nenhuma mensagem com zapi_message_id no período."
          : counts.accepted_only / total > 0.3
            ? "ALERTA: mais de 30% das mensagens têm apenas aceite da Z-API, sem confirmação de entrega via webhook. Pode ser webhook quebrado (ID mismatch) ou entrega realmente falhando."
            : "Taxa de confirmação dentro do esperado.",
    };

    console.log(`[zapi-check-message-status] tenant=${tenant_id} ${JSON.stringify(summary)}`);

    return new Response(
      JSON.stringify({
        success: true,
        mode: phone ? "by_phone" : "audit",
        tenant_id,
        hours: safeHours,
        phone_filter: phone || null,
        ...summary,
        samples: samplePerBucket,
        elapsed_ms: Date.now() - t0,
        important_note:
          "A Z-API Multi-Device NÃO oferece endpoint REST para consultar status por messageId. O status só chega via webhook (DeliveryCallback). Se o webhook estiver com bug (ex.: ID mismatch zapiMessageId vs zaapId), mensagens entregues aparecerão para sempre como 'accepted_only' aqui.",
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
