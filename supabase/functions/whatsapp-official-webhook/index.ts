import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Esta função é PÚBLICA — Meta chama sem JWT.
// Configure verify_jwt = false em supabase/config.toml

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // GET: handshake de verificação
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe" || !token) {
      return new Response("Bad Request", { status: 400 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await supabase
      .from("integration_whatsapp_official")
      .select("tenant_id")
      .eq("webhook_verify_token", token)
      .maybeSingle();

    if (!data) return new Response("Forbidden", { status: 403 });
    return new Response(challenge || "", { status: 200 });
  }

  // POST: eventos
  try {
    const body = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const ch of changes) {
        const value = ch.value || {};
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const { data: integ } = await supabase
          .from("integration_whatsapp_official")
          .select("tenant_id")
          .eq("phone_number_id", phoneNumberId)
          .maybeSingle();
        if (!integ) continue;
        const tenantId = integ.tenant_id;

        // Mensagens recebidas
        for (const msg of (value.messages || [])) {
          const from = msg.from;
          const text =
            msg?.text?.body ||
            msg?.button?.text ||
            msg?.interactive?.button_reply?.title ||
            msg?.interactive?.list_reply?.title ||
            `[${msg.type}]`;
          try {
            await supabase.from("whatsapp_messages").insert({
              tenant_id: tenantId,
              phone: from,
              message: String(text).substring(0, 500),
              type: "incoming",
              created_at: new Date().toISOString(),
              zapi_message_id: msg.id || null,
            });
          } catch (e) { console.error("[whatsapp-official-webhook] insert msg", e); }
        }

        // Status (sent/delivered/read/failed)
        for (const st of (value.statuses || [])) {
          try {
            await supabase
              .from("whatsapp_messages")
              .update({ delivery_status: (st.status || "").toUpperCase() })
              .eq("tenant_id", tenantId)
              .eq("zapi_message_id", st.id);
          } catch (e) { console.error("[whatsapp-official-webhook] status update", e); }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[whatsapp-official-webhook] error", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
