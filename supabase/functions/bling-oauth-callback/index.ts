import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Bling OAuth2 Token URL
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

// URL base para redirecionamentos
const getPublicBaseUrl = () => {
  let baseUrl = Deno.env.get("PUBLIC_BASE_URL") || "https://hxtbsieodbtzgcvvkeqx.lovableproject.com";
  
  // Garantir que a URL tenha o protocolo https://
  if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`;
  }
  
  return baseUrl;
};

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicBaseUrl = getPublicBaseUrl();
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    console.log("[bling-oauth-callback] Recebido callback OAuth");
    console.log("[bling-oauth-callback] State recebido:", state);
    console.log("[bling-oauth-callback] Code recebido:", code ? "sim" : "não");

    // Verificar se houve erro na autorização
    if (error) {
      console.error("[bling-oauth-callback] Erro na autorização:", error, errorDescription);
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", errorDescription || error);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Verificar se temos code e state
    if (!code || !state) {
      console.error("[bling-oauth-callback] Code ou state faltando");
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", "Parâmetros inválidos - code ou state faltando");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Decodificar state para obter tenant_id
    let stateData;
    try {
      // Tentar decodificar o state como base64 JSON
      const decodedState = atob(state);
      stateData = JSON.parse(decodedState);
      console.log("[bling-oauth-callback] State decodificado:", stateData);
    } catch (e) {
      console.error("[bling-oauth-callback] Erro ao decodificar state:", e);
      console.error("[bling-oauth-callback] State bruto:", state);
      
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", "State inválido. Use o botão 'Autorizar Bling ERP' no sistema para gerar o link correto.");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const { tenant_id } = stateData;

    if (!tenant_id) {
      console.error("[bling-oauth-callback] tenant_id não encontrado no state");
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", "Tenant não identificado no state");
      return Response.redirect(redirectUrl.toString(), 302);
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
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", "Integração não encontrada para este tenant");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    if (!integration.client_id || !integration.client_secret) {
      console.error("[bling-oauth-callback] Credenciais incompletas");
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", "Client ID ou Client Secret não configurados");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Trocar authorization code por tokens
    const callbackUrl = `${supabaseUrl}/functions/v1/bling-oauth-callback`;
    const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);

    console.log("[bling-oauth-callback] Trocando code por tokens...");
    console.log("[bling-oauth-callback] Callback URL usado:", callbackUrl);

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
    console.log(`[bling-oauth-callback] Token response: ${tokenText.substring(0, 200)}`);

    if (!tokenResponse.ok) {
      console.error("[bling-oauth-callback] Erro ao obter tokens:", tokenText);
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", `Falha ao obter tokens: ${tokenText.substring(0, 100)}`);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch (e) {
      console.error("[bling-oauth-callback] Erro ao parsear resposta:", tokenText);
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", "Resposta inválida do Bling ao obter tokens");
      return Response.redirect(redirectUrl.toString(), 302);
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
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("bling", "error");
      redirectUrl.searchParams.set("reason", "Erro ao salvar tokens no banco de dados");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    console.log(`[bling-oauth-callback] Autorização completa para tenant: ${tenant_id}`);

    // Redirecionar para a página de integrações com sucesso
    const redirectUrl = new URL("/integracoes", publicBaseUrl);
    redirectUrl.searchParams.set("bling", "success");
    return Response.redirect(redirectUrl.toString(), 302);

  } catch (error) {
    console.error("[bling-oauth-callback] Erro geral:", error);
    
    const publicBaseUrl = getPublicBaseUrl();
    const redirectUrl = new URL("/integracoes", publicBaseUrl);
    redirectUrl.searchParams.set("bling", "error");
    redirectUrl.searchParams.set("reason", `Erro interno: ${error.message}`);
    return Response.redirect(redirectUrl.toString(), 302);
  }
});
