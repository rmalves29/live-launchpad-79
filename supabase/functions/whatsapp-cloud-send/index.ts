import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://hxtbsieodbtzgcvvkeqx.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const payload = await req.json();
    const { tenant_id, template_name, language_code, to_phone, components } = payload;

    if (!tenant_id || !template_name || !to_phone) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id, template_name e to_phone são obrigatórios" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar config do WhatsApp Cloud para o tenant
    const { data: config, error: configError } = await supabase
      .from("integration_whatsapp_cloud")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (configError || !config) {
      console.error("❌ Config não encontrada:", configError);
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp Cloud API não configurada para este tenant" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.access_token || !config.phone_number_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Access Token ou Phone Number ID não configurados" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalizar telefone (formato internacional sem +)
    let phone = to_phone.replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) {
      phone = "55" + phone;
    }

    // Montar payload da Meta Cloud API
    const metaPayload: any = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: template_name,
        language: { code: language_code || "pt_BR" },
      },
    };

    // Adicionar components se fornecidos (variáveis de template)
    if (components && Array.isArray(components) && components.length > 0) {
      metaPayload.template.components = components;
    }

    console.log(`📤 Enviando template "${template_name}" para ${phone} via Meta Cloud API`);

    const metaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metaPayload),
      }
    );

    const metaResult = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("❌ Erro Meta API:", JSON.stringify(metaResult));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: metaResult.error?.message || "Erro ao enviar mensagem",
          meta_error: metaResult.error 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messageId = metaResult.messages?.[0]?.id;
    console.log(`✅ Mensagem enviada! ID: ${messageId}`);

    // Registrar no log
    await supabase.from("whatsapp_messages").insert({
      tenant_id,
      phone,
      message: `[Cloud API] Template: ${template_name}`,
      type: "cloud_template",
      sent_at: new Date().toISOString(),
      processed: true,
    }).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, message_id: messageId, meta_response: metaResult }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Erro geral:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
