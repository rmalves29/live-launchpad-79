import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://hxtbsieodbtzgcvvkeqx.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  // GET = verificação do webhook pela Meta
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = Deno.env.get("WHATSAPP_CLOUD_VERIFY_TOKEN") || "orderzap_cloud_verify";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verificado com sucesso");
      return new Response(challenge, { status: 200 });
    }

    console.error("❌ Verificação falhou - token inválido");
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // POST = eventos do webhook
  try {
    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Processar cada entry
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== "messages") continue;

        const value = change.value;
        const metadata = value.metadata;
        const phoneNumberId = metadata?.phone_number_id;

        // Buscar tenant pelo phone_number_id
        const { data: config } = await supabase
          .from("integration_whatsapp_cloud")
          .select("tenant_id")
          .eq("phone_number_id", phoneNumberId)
          .eq("is_active", true)
          .maybeSingle();

        if (!config) {
          console.log(`⚠️ Nenhum tenant para phone_number_id: ${phoneNumberId}`);
          continue;
        }

        // Processar status de mensagens
        const statuses = value.statuses || [];
        for (const status of statuses) {
          console.log(`📊 Status: ${status.status} | ID: ${status.id} | Phone: ${status.recipient_id}`);

          // Registrar status no log
          await supabase.from("whatsapp_messages").insert({
            tenant_id: config.tenant_id,
            phone: status.recipient_id,
            message: `[Status] ${status.status}${status.errors ? ' - Erro: ' + JSON.stringify(status.errors) : ''}`,
            type: "cloud_status",
            processed: true,
          }).catch((e) => console.error("Erro ao registrar status:", e));

          // Se for erro, logar detalhes
          if (status.status === "failed" && status.errors) {
            console.error(`❌ Falha no envio para ${status.recipient_id}:`, JSON.stringify(status.errors));
          }
        }

        // Processar mensagens recebidas (respostas dos clientes)
        const messages = value.messages || [];
        for (const msg of messages) {
          const fromPhone = msg.from;
          const messageText = msg.text?.body || msg.type;
          
          console.log(`📩 Mensagem recebida de ${fromPhone}: ${messageText}`);

          // Registrar mensagem recebida
          await supabase.from("whatsapp_messages").insert({
            tenant_id: config.tenant_id,
            phone: fromPhone,
            message: `[Recebida] ${messageText}`,
            type: "cloud_received",
            processed: true,
          }).catch((e) => console.error("Erro ao registrar msg recebida:", e));

          // Verificar se é resposta "SIM" para consentimento
          if (messageText && messageText.trim().toUpperCase() === "SIM") {
            // Atualizar consentimento do cliente
            await supabase
              .from("customers")
              .update({
                consentimento_ativo: true,
                data_permissao: new Date().toISOString(),
              })
              .eq("tenant_id", config.tenant_id)
              .eq("phone", fromPhone)
              .catch((e) => console.error("Erro ao atualizar consentimento:", e));

            console.log(`✅ Consentimento atualizado para ${fromPhone}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ Erro no webhook:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
