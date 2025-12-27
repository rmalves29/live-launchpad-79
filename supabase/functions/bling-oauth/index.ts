import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bling OAuth2 URLs
const BLING_AUTH_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Ação: Iniciar OAuth - gera a URL de autorização
    if (action === "authorize") {
      const { tenant_id } = await req.json();

      if (!tenant_id) {
        return new Response(
          JSON.stringify({ error: "tenant_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar credenciais do tenant
      const { data: integration, error: integrationError } = await supabase
        .from("integration_bling")
        .select("client_id, client_secret")
        .eq("tenant_id", tenant_id)
        .single();

      if (integrationError || !integration) {
        return new Response(
          JSON.stringify({ error: "Integração Bling não encontrada. Salve as credenciais primeiro." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!integration.client_id || !integration.client_secret) {
        return new Response(
          JSON.stringify({ error: "Client ID e Client Secret são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Gerar state para segurança (inclui tenant_id codificado)
      // Usar encodeURIComponent para evitar problemas com caracteres especiais
      const statePayload = JSON.stringify({ tenant_id, timestamp: Date.now() });
      const state = encodeURIComponent(statePayload);

      // Callback URL - aponta para a edge function de callback
      const callbackUrl = `${supabaseUrl}/functions/v1/bling-oauth-callback`;

      // Construir URL de autorização do Bling
      const authParams = new URLSearchParams({
        response_type: "code",
        client_id: integration.client_id,
        redirect_uri: callbackUrl,
        state: state,
      });

      const authorizationUrl = `${BLING_AUTH_URL}?${authParams.toString()}`;

      console.log(`[bling-oauth] Gerando URL de autorização para tenant: ${tenant_id}`);
      console.log(`[bling-oauth] Callback URL: ${callbackUrl}`);

      return new Response(
        JSON.stringify({ 
          authorization_url: authorizationUrl,
          state: state 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ação: Verificar status do token
    if (action === "status") {
      const { tenant_id } = await req.json();

      if (!tenant_id) {
        return new Response(
          JSON.stringify({ error: "tenant_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: integration, error } = await supabase
        .from("integration_bling")
        .select("access_token, refresh_token, token_expires_at, is_active")
        .eq("tenant_id", tenant_id)
        .single();

      if (error || !integration) {
        return new Response(
          JSON.stringify({ 
            authorized: false, 
            reason: "Integração não encontrada" 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const hasValidToken = !!(integration.access_token && integration.refresh_token);
      const isExpired = integration.token_expires_at 
        ? new Date(integration.token_expires_at) < new Date() 
        : true;

      return new Response(
        JSON.stringify({ 
          authorized: hasValidToken,
          is_active: integration.is_active,
          is_expired: isExpired,
          expires_at: integration.token_expires_at
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ação: Refresh token
    if (action === "refresh") {
      const { tenant_id } = await req.json();

      if (!tenant_id) {
        return new Response(
          JSON.stringify({ error: "tenant_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: integration, error: integrationError } = await supabase
        .from("integration_bling")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single();

      if (integrationError || !integration || !integration.refresh_token) {
        return new Response(
          JSON.stringify({ error: "Refresh token não encontrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fazer requisição para renovar o token
      const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);
      
      const tokenResponse = await fetch(BLING_TOKEN_URL, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: integration.refresh_token,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("[bling-oauth] Erro ao renovar token:", errorText);
        return new Response(
          JSON.stringify({ error: "Falha ao renovar token", details: errorText }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData = await tokenResponse.json();
      console.log("[bling-oauth] Token renovado com sucesso");

      // Calcular data de expiração
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 21600)); // 6 horas default

      // Atualizar tokens no banco
      const { error: updateError } = await supabase
        .from("integration_bling")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenant_id);

      if (updateError) {
        console.error("[bling-oauth] Erro ao salvar novos tokens:", updateError);
        return new Response(
          JSON.stringify({ error: "Erro ao salvar novos tokens" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          expires_at: expiresAt.toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação não reconhecida. Use: authorize, status, refresh" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[bling-oauth] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
