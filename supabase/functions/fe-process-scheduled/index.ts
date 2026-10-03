import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// O cron chama esta função a cada minuto. Em vez de só enviar o que já venceu, ela fica "de plantão"
// por até ~55 s: assim esperas de poucos segundos entre as etapas de uma sequência são respeitadas.
const LOOP_SECONDS = 55;
const LOOKAHEAD_MS = LOOP_SECONDS * 1000;

type Msg = {
  id: string;
  tenant_id: string;
  group_id: string | null;
  content_type: string;
  content_text: string | null;
  media_url: string | null;
  poll_options: unknown;
  poll_selectable_count: number | null;
  scheduled_at: string;
  depends_on: string | null;
  delay_seconds: number | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const startedAt = Date.now();
    const horizon = new Date(startedAt + LOOKAHEAD_MS).toISOString();

    // Pendentes que vencem agora ou nos próximos ~55 s (inclui etapas que dependem de outra mensagem).
    const { data: candidates, error } = await supabase
      .from("fe_messages")
      .select("id, tenant_id, group_id, content_type, content_text, media_url, poll_options, poll_selectable_count, scheduled_at, depends_on, delay_seconds")
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", horizon)
      .order("scheduled_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("[fe-process-scheduled] Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!candidates?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No pending messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[fe-process-scheduled] ${candidates.length} candidate message(s)`);

    const markFailed = async (id: string, reason: string) => {
      await supabase
        .from("fe_messages")
        .update({ status: "failed", error_message: reason.slice(0, 300) })
        .eq("id", id)
        .eq("status", "pending");
    };

    const sendOne = async (msg: Msg): Promise<"sent" | "failed" | "skipped"> => {
      if (!msg.group_id) {
        await markFailed(msg.id, "Mensagem sem grupo de destino");
        return "failed";
      }

      const { data: locked, error: lockError } = await supabase
        .from("fe_messages")
        .update({ status: "sending" })
        .eq("id", msg.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (lockError) {
        console.error(`[fe-process-scheduled] Lock error for message ${msg.id}: ${lockError.message}`);
        return "failed";
      }
      if (!locked) return "skipped"; // outra execução já pegou

      try {
        const sendRes = await fetch(`${supabaseUrl}/functions/v1/fe-send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({
            tenant_id: msg.tenant_id,
            group_ids: [msg.group_id],
            message_ids: [msg.id],
            content_type: msg.content_type,
            content_text: msg.content_text,
            media_url: msg.media_url,
            poll_options: msg.poll_options,
            poll_selectable_count: msg.poll_selectable_count,
          }),
        });
        const payload = await sendRes.json().catch(() => null);

        if (!sendRes.ok || !payload?.sent) {
          const errText = payload?.results?.[0]?.error || payload?.error || payload?.message || JSON.stringify(payload || {});
          console.error(`[fe-process-scheduled] Send failed for message ${msg.id}: ${errText}`);
          await supabase
            .from("fe_messages")
            .update({ status: "failed", error_message: String(errText).slice(0, 300) })
            .eq("id", msg.id)
            .eq("status", "sending");
          return "failed";
        }
        return "sent";
      } catch (err: any) {
        console.error(`[fe-process-scheduled] Error for message ${msg.id}:`, err.message);
        await supabase
          .from("fe_messages")
          .update({ status: "failed", error_message: String(err.message || "Erro inesperado").slice(0, 300) })
          .eq("id", msg.id)
          .eq("status", "sending");
        return "failed";
      }
    };

    const run = async () => {
      const deadline = startedAt + LOOP_SECONDS * 1000;
      const waiting = new Map<string, Msg>((candidates as Msg[]).map((m) => [m.id, m]));
      let sent = 0, failed = 0;

      while (waiting.size > 0 && Date.now() < deadline) {
        // situação das mensagens das quais as etapas seguintes dependem
        const predIds = Array.from(new Set(Array.from(waiting.values()).map((m) => m.depends_on).filter(Boolean))) as string[];
        const preds = new Map<string, { status: string; sent_at: string | null }>();
        if (predIds.length) {
          const { data } = await supabase.from("fe_messages").select("id, status, sent_at").in("id", predIds);
          for (const p of data || []) preds.set(p.id, { status: p.status, sent_at: p.sent_at });
        }

        const now = Date.now();
        const ready: Array<{ msg: Msg; due: number }> = [];

        for (const msg of Array.from(waiting.values())) {
          let due = new Date(msg.scheduled_at).getTime();

          if (msg.depends_on) {
            const pred = preds.get(msg.depends_on);
            if (pred) {
              if (pred.status === "pending" || pred.status === "sending") continue; // ainda não saiu a etapa anterior
              if (pred.status === "failed") {
                await markFailed(msg.id, "A etapa anterior da sequência falhou, então esta não foi enviada.");
                waiting.delete(msg.id);
                failed += 1;
                continue;
              }
              if (pred.sent_at) due = Math.max(due, new Date(pred.sent_at).getTime() + (msg.delay_seconds || 0) * 1000);
            }
            // etapa anterior apagada/cancelada: segue pelo horário agendado
          }

          if (due > deadline) { waiting.delete(msg.id); continue; } // fica para a próxima rodada
          ready.push({ msg, due });
        }

        const due = ready.filter((r) => r.due <= now).sort((a, b) => a.due - b.due);
        if (due.length) {
          for (const r of due) {
            waiting.delete(r.msg.id);
            const result = await sendOne(r.msg);
            if (result === "sent") sent += 1;
            else if (result === "failed") failed += 1;
          }
          continue; // reavalia (o envio pode liberar etapas seguintes)
        }

        // nada pronto agora: dorme até a próxima etapa vencer (ou 1 s, para reavaliar dependências)
        const nextDue = ready.length ? Math.min(...ready.map((r) => r.due)) - Date.now() : 1000;
        await sleep(Math.min(Math.max(nextDue, 200), 1000));
      }

      console.log(`[fe-process-scheduled] done: sent=${sent} failed=${failed} left=${waiting.size}`);
    };

    EdgeRuntime.waitUntil(run().catch((e) => console.error("[fe-process-scheduled] run error:", e?.message || e)));

    return new Response(JSON.stringify({ queued: candidates.length }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[fe-process-scheduled] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
