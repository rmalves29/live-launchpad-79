import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Bling OAuth2 Token URL
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") || "https://hxtbsieodbtzgcvvkeqx.lovableproject.com";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    console.log("[bling-oauth-callback] Recebido callback OAuth");

    // Verificar se houve erro na autorização
    if (error) {
      console.error("[bling-oauth-callback] Erro na autorização:", error, errorDescription);
      const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent(errorDescription || error)}`;
      return Response.redirect(redirectUrl, 302);
    }

    // Verificar se temos code e state
    if (!code || !state) {
      console.error("[bling-oauth-callback] Code ou state faltando");
      const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent("Parâmetros inválidos")}`;
      return Response.redirect(redirectUrl, 302);
    }

    // Decodificar state para obter tenant_id
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error("[bling-oauth-callback] Erro ao decodificar state:", e);
      const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent("State inválido")}`;
      return Response.redirect(redirectUrl, 302);
    }

    const { tenant_id } = stateData;

    if (!tenant_id) {
      console.error("[bling-oauth-callback] tenant_id não encontrado no state");
      const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent("Tenant não identificado")}`;
      return Response.redirect(redirectUrl, 302);
    }

    console.log(`[bling-oauth-callback] Processando callback para tenant: ${tenant_id}`);

    // Buscar credenciais do tenant
    const { data: integration, error: integrationError } = await supabase
      .from("integration_bling")
      .select("client_id, client_secret")
      .eq("tenant_id", tenant_id)
      .single();

    if (integrationError || !integration) {
      console.error("[bling-oauth-callback] Integração não encontrada:", integrationError);
      const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent("Integração não encontrada")}`;
      return Response.redirect(redirectUrl, 302);
    }

    // Trocar authorization code por tokens
    const callbackUrl = `${supabaseUrl}/functions/v1/bling-oauth-callback`;
    const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);

    console.log("[bling-oauth-callback] Trocando code por tokens...");

    const tokenResponse = await fetch(BLING_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: callbackUrl,
      }),
    });

    const tokenText = await tokenResponse.text();
    console.log(`[bling-oauth-callback] Token response status: ${tokenResponse.status}`);

    if (!tokenResponse.ok) {
      console.error("[bling-oauth-callback] Erro ao obter tokens:", tokenText);
      const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent("Falha ao obter tokens")}`;
      return Response.redirect(redirectUrl, 302);
    }

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch (e) {
      console.error("[bling-oauth-callback] Erro ao parsear resposta:", tokenText);
      const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent("Resposta inválida do Bling")}`;
      return Response.redirect(redirectUrl, 302);
    }

    console.log("[bling-oauth-callback] Tokens obtidos com sucesso");

    // Calcular data de expiração
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 21600)); // 6 horas default

    // Salvar tokens no banco
    const { error: updateError } = await supabase
      .from("integration_bling")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenant_id);

    if (updateError) {
      console.error("[bling-oauth-callback] Erro ao salvar tokens:", updateError);
      const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent("Erro ao salvar tokens")}`;
      return Response.redirect(redirectUrl, 302);
    }

    console.log(`[bling-oauth-callback] Autorização completa para tenant: ${tenant_id}`);

    // Redirecionar para a página de integrações com sucesso
    const redirectUrl = `${publicBaseUrl}/integracoes?bling=success`;
    return Response.redirect(redirectUrl, 302);

  } catch (error) {
    console.error("[bling-oauth-callback] Erro geral:", error);
    const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") || "https://hxtbsieodbtzgcvvkeqx.lovableproject.com";
    const redirectUrl = `${publicBaseUrl}/integracoes?bling=error&reason=${encodeURIComponent(error.message)}`;
    return Response.redirect(redirectUrl, 302);
  }
});
