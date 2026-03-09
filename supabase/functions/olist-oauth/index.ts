import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Olist ERP (Tiny) OAuth2 URLs
const OLIST_AUTH_URL = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth";
const OLIST_TOKEN_URL = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";

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

    // Ação: Iniciar OAuth
    if (action === "authorize") {
      const { tenant_id } = await req.json();

      if (!tenant_id) {
        return new Response(
          JSON.stringify({ error: "tenant_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: integration, error: integrationError } = await supabase
        .from("integration_olist")
        .select("client_id, client_secret")
        .eq("tenant_id", tenant_id)
        .single();

      if (integrationError || !integration) {
        return new Response(
          JSON.stringify({ error: "Integração Olist não encontrada. Salve as credenciais primeiro." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!integration.client_id || !integration.client_secret) {
        return new Response(
          JSON.stringify({ error: "Client ID e Client Secret são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statePayload = JSON.stringify({ tenant_id, timestamp: Date.now() });
      const callbackUrl = `${supabaseUrl}/functions/v1/olist-oauth-callback`;

      const authParams = new URLSearchParams({
        response_type: "code",
        client_id: integration.client_id,
        redirect_uri: callbackUrl,
        scope: "openid",
        state: statePayload,
      });

      const authorizationUrl = `${OLIST_AUTH_URL}?${authParams.toString()}`;

      console.log(`[olist-oauth] Gerando URL de autorização para tenant: ${tenant_id}`);

      return new Response(
        JSON.stringify({ authorization_url: authorizationUrl, state: statePayload }),
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
        .from("integration_olist")
        .select("access_token, refresh_token, token_expires_at, is_active")
        .eq("tenant_id", tenant_id)
        .single();

      if (error || !integration) {
        return new Response(
          JSON.stringify({ authorized: false, reason: "Integração não encontrada" }),
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
          expires_at: integration.token_expires_at,
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
        .from("integration_olist")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single();

      if (integrationError || !integration || !integration.refresh_token) {
        return new Response(
          JSON.stringify({ error: "Refresh token não encontrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenResponse = await fetch(OLIST_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: integration.client_id,
          client_secret: integration.client_secret,
          refresh_token: integration.refresh_token,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("[olist-oauth] Erro ao renovar token:", errorText);
        return new Response(
          JSON.stringify({ error: "Falha ao renovar token", details: errorText }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData = await tokenResponse.json();
      console.log("[olist-oauth] Token renovado com sucesso");

      // Token expira em 4 horas (14400s)
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 14400));

      const { error: updateError } = await supabase
        .from("integration_olist")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || integration.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenant_id);

      if (updateError) {
        console.error("[olist-oauth] Erro ao salvar novos tokens:", updateError);
        return new Response(
          JSON.stringify({ error: "Erro ao salvar novos tokens" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, expires_at: expiresAt.toISOString() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação não reconhecida. Use: authorize, status, refresh" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[olist-oauth] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
