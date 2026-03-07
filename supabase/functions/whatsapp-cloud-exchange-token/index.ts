import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const { code, tenant_id, waba_id, phone_number_id } = payload;

    if (!code || !tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "code e tenant_id são obrigatórios" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID");
    const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET");

    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      console.error("❌ FACEBOOK_APP_ID ou FACEBOOK_APP_SECRET não configurados");
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais do Facebook App não configuradas no servidor" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Trocar o code por um short-lived token
    console.log("🔄 Trocando code por access token...");
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error("❌ Erro ao trocar code:", JSON.stringify(tokenData));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: tokenData.error?.message || "Erro ao trocar code por token",
          details: tokenData.error 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shortLivedToken = tokenData.access_token;
    console.log("✅ Short-lived token obtido");

    // 2. Trocar por um long-lived token (60 dias)
    console.log("🔄 Obtendo long-lived token...");
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${shortLivedToken}`;

    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    let finalToken = shortLivedToken;
    if (longLivedResponse.ok && longLivedData.access_token) {
      finalToken = longLivedData.access_token;
      console.log("✅ Long-lived token obtido (60 dias)");
    } else {
      console.warn("⚠️ Não foi possível obter long-lived token, usando short-lived:", longLivedData);
    }

    // 3. Se não recebemos phone_number_id e waba_id do frontend, buscar via API
    let finalPhoneNumberId = phone_number_id || "";
    let finalWabaId = waba_id || "";
    let businessName = "";

    if (!finalWabaId) {
      // Buscar WABA IDs associados ao token
      console.log("🔍 Buscando WABA ID...");
      const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${finalToken}&access_token=${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
      const debugResponse = await fetch(debugUrl);
      const debugData = await debugResponse.json();

      // Tentar buscar via business shared WABAs
      const wabaSearchUrl = `https://graph.facebook.com/v21.0/me/businesses?access_token=${finalToken}`;
      const wabaSearchResponse = await fetch(wabaSearchUrl);
      const wabaSearchData = await wabaSearchResponse.json();

      if (wabaSearchData.data && wabaSearchData.data.length > 0) {
        const businessId = wabaSearchData.data[0].id;
        businessName = wabaSearchData.data[0].name || "";

        // Buscar WABAs do business
        const wabasUrl = `https://graph.facebook.com/v21.0/${businessId}/owned_whatsapp_business_accounts?access_token=${finalToken}`;
        const wabasResponse = await fetch(wabasUrl);
        const wabasData = await wabasResponse.json();

        if (wabasData.data && wabasData.data.length > 0) {
          finalWabaId = wabasData.data[0].id;
          console.log(`✅ WABA ID encontrado: ${finalWabaId}`);

          // Buscar phone numbers deste WABA
          if (!finalPhoneNumberId) {
            const phonesUrl = `https://graph.facebook.com/v21.0/${finalWabaId}/phone_numbers?access_token=${finalToken}`;
            const phonesResponse = await fetch(phonesUrl);
            const phonesData = await phonesResponse.json();

            if (phonesData.data && phonesData.data.length > 0) {
              finalPhoneNumberId = phonesData.data[0].id;
              console.log(`✅ Phone Number ID encontrado: ${finalPhoneNumberId}`);
            }
          }
        }
      }
    }

    // 4. Salvar no banco de dados
    console.log("💾 Salvando credenciais no banco...");
    const configPayload = {
      tenant_id,
      access_token: finalToken,
      phone_number_id: finalPhoneNumberId,
      waba_id: finalWabaId,
      business_name: businessName,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Verificar se já existe config para este tenant
    const { data: existingConfig } = await supabase
      .from("integration_whatsapp_cloud")
      .select("id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (existingConfig) {
      const { error: updateError } = await supabase
        .from("integration_whatsapp_cloud")
        .update(configPayload)
        .eq("id", existingConfig.id);

      if (updateError) {
        console.error("❌ Erro ao atualizar config:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao salvar configuração: " + updateError.message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      const { error: insertError } = await supabase
        .from("integration_whatsapp_cloud")
        .insert(configPayload);

      if (insertError) {
        console.error("❌ Erro ao inserir config:", insertError);
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao salvar configuração: " + insertError.message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("✅ Configuração salva com sucesso!");

    return new Response(
      JSON.stringify({
        success: true,
        waba_id: finalWabaId,
        phone_number_id: finalPhoneNumberId,
        business_name: businessName,
      }),
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
