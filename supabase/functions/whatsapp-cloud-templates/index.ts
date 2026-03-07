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
    const { tenant_id, action } = payload;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id é obrigatório" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar config do tenant
    const { data: config, error: configError } = await supabase
      .from("integration_whatsapp_cloud")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp Cloud API não configurada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.access_token || !config.waba_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Access Token ou WABA ID não configurados" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ GET PHONE INFO ============
    if (action === "get_phone_info") {
      const phoneUrl = `https://graph.facebook.com/v21.0/${config.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,platform_type&access_token=${config.access_token}`;
      const phoneRes = await fetch(phoneUrl);
      const phoneData = await phoneRes.json();

      if (!phoneRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: phoneData.error?.message || "Erro ao buscar info do telefone" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, phone: phoneData }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ LIST TEMPLATES ============
    if (action === "list_templates") {
      const templatesUrl = `https://graph.facebook.com/v21.0/${config.waba_id}/message_templates?fields=name,status,category,language,components&limit=100&access_token=${config.access_token}`;
      const templatesRes = await fetch(templatesUrl);
      const templatesData = await templatesRes.json();

      if (!templatesRes.ok) {
        console.error("❌ Erro ao listar templates:", JSON.stringify(templatesData));
        return new Response(
          JSON.stringify({ success: false, error: templatesData.error?.message || "Erro ao listar templates" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, templates: templatesData.data || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ CREATE TEMPLATE ============
    if (action === "create_template") {
      const { name, category, language, header_text, body_text, footer_text } = payload;

      if (!name || !category || !body_text) {
        return new Response(
          JSON.stringify({ success: false, error: "name, category e body_text são obrigatórios" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const components: any[] = [];

      if (header_text) {
        components.push({ type: "HEADER", format: "TEXT", text: header_text });
      }

      components.push({ type: "BODY", text: body_text });

      if (footer_text) {
        components.push({ type: "FOOTER", text: footer_text });
      }

      const templatePayload = {
        name: name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
        category,
        language: language || "pt_BR",
        components,
      };

      console.log("📤 Criando template:", JSON.stringify(templatePayload));

      const createRes = await fetch(
        `https://graph.facebook.com/v21.0/${config.waba_id}/message_templates`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(templatePayload),
        }
      );

      const createData = await createRes.json();

      if (!createRes.ok) {
        console.error("❌ Erro ao criar template:", JSON.stringify(createData));
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: createData.error?.message || "Erro ao criar template",
            details: createData.error 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("✅ Template criado:", JSON.stringify(createData));

      return new Response(
        JSON.stringify({ success: true, template: createData }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida. Use: list_templates, create_template, get_phone_info" }),
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
