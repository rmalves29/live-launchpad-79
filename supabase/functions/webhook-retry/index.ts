// Webhook Retry — Fase 5
// Reprocessa um webhook_log falho invocando o handler correto.
// Idempotência garantida via external_event_id (Fase 1).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MAX_RETRIES = 3;

// Mapa webhook_type -> edge function alvo
const HANDLER_MAP: Record<string, string> = {
  mercadopago: "mp-webhook",
  mp: "mp-webhook",
  bling: "bling-webhook",
  pagarme: "pagarme-webhook",
  appmax: "appmax-webhook",
  whatsapp: "zapi-webhook",
  uazapi: "uazapi-webhook",
  instagram: "instagram-webhook",
  frenet: "frenet-webhook",
  melhor_envio: "melhor-envio-webhook",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { webhook_log_id } = await req.json();
    if (!webhook_log_id) {
      return new Response(JSON.stringify({ success: false, error: "webhook_log_id obrigatório" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: log, error: logErr } = await supabase
      .from("webhook_logs")
      .select("*")
      .eq("id", webhook_log_id)
      .maybeSingle();

    if (logErr || !log) {
      return new Response(JSON.stringify({ success: false, error: "Log não encontrado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((log.retry_count || 0) >= MAX_RETRIES) {
      return new Response(
        JSON.stringify({ success: false, error: `Limite de ${MAX_RETRIES} tentativas atingido` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const targetFn = HANDLER_MAP[String(log.webhook_type || "").toLowerCase()];
    if (!targetFn) {
      return new Response(
        JSON.stringify({ success: false, error: `Handler não mapeado para webhook_type='${log.webhook_type}'` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reinvocar o handler com o payload original
    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(targetFn, {
      body: log.payload,
    });

    // Atualiza contador de retry
    await supabase
      .from("webhook_logs")
      .update({
        retry_count: (log.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString(),
      })
      .eq("id", webhook_log_id);

    if (invokeErr) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Handler ${targetFn} falhou: ${invokeErr.message}`,
          retry_count: (log.retry_count || 0) + 1,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        handler: targetFn,
        retry_count: (log.retry_count || 0) + 1,
        result: invokeData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[webhook-retry] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e?.message || e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
