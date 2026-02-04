import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // tenant_id
  const error = url.searchParams.get('error');
  const errorReason = url.searchParams.get('error_reason');

  const APP_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://live-launchpad-79.lovable.app';
  const FB_APP_ID = Deno.env.get('FACEBOOK_APP_ID');
  const FB_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');
  const REDIRECT_URI = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/instagram-auth-callback';

  console.log('[Instagram OAuth Callback] Iniciando...');
  console.log('[Instagram OAuth Callback] State (tenant_id):', state);

  // Se houve erro no OAuth
  if (error) {
    console.error('[Instagram OAuth Callback] Erro OAuth:', error, errorReason);
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(errorReason || error)}`);
  }

  if (!code) {
    console.error('[Instagram OAuth Callback] Código não fornecido');
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=codigo_nao_fornecido`);
  }

  if (!state) {
    console.error('[Instagram OAuth Callback] State (tenant_id) não fornecido');
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=tenant_nao_identificado`);
  }

  if (!FB_APP_ID || !FB_APP_SECRET) {
    console.error('[Instagram OAuth Callback] Credenciais do Facebook App não configuradas');
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=credenciais_nao_configuradas`);
  }

  try {
    // 1. Trocar código por access token
    console.log('[Instagram OAuth Callback] Trocando código por access token...');
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${FB_APP_SECRET}&code=${code}`;
    
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[Instagram OAuth Callback] Erro ao obter token:', tokenData.error);
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(tokenData.error.message)}`);
    }

    const shortLivedToken = tokenData.access_token;
    console.log('[Instagram OAuth Callback] Token de curta duração obtido');

    // 2. Trocar por token de longa duração
    console.log('[Instagram OAuth Callback] Obtendo token de longa duração...');
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${shortLivedToken}`;
    
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.error('[Instagram OAuth Callback] Erro ao obter token longo:', longLivedData.error);
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(longLivedData.error.message)}`);
    }

    const longLivedToken = longLivedData.access_token;
    console.log('[Instagram OAuth Callback] Token de longa duração obtido');

    // 3. Buscar páginas do usuário
    console.log('[Instagram OAuth Callback] Buscando páginas do usuário...');
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedToken}`;
    
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error('[Instagram OAuth Callback] Erro ao buscar páginas:', pagesData.error);
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(pagesData.error.message)}`);
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      console.error('[Instagram OAuth Callback] Nenhuma página encontrada');
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=nenhuma_pagina_encontrada`);
    }

    // 4. Encontrar página com Instagram Business Account
    const pageWithInstagram = pagesData.data.find((page: any) => page.instagram_business_account);

    if (!pageWithInstagram) {
      console.error('[Instagram OAuth Callback] Nenhuma página com Instagram Business vinculado');
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=instagram_business_nao_vinculado`);
    }

    const pageId = pageWithInstagram.id;
    const pageName = pageWithInstagram.name;
    const pageAccessToken = pageWithInstagram.access_token;
    const instagramAccountId = pageWithInstagram.instagram_business_account.id;

    console.log('[Instagram OAuth Callback] Página encontrada:', pageName);
    console.log('[Instagram OAuth Callback] Page ID:', pageId);
    console.log('[Instagram OAuth Callback] Instagram Account ID:', instagramAccountId);

    // 5. Salvar no banco de dados
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gerar token de verificação único
    const webhookVerifyToken = crypto.randomUUID().replace(/-/g, '').substring(0, 32);

    const { error: upsertError } = await supabase
      .from('integration_instagram')
      .upsert({
        tenant_id: state,
        instagram_account_id: instagramAccountId,
        page_id: pageId,
        page_access_token: pageAccessToken,
        access_token: longLivedToken,
        webhook_verify_token: webhookVerifyToken,
        is_active: true,
        environment: 'production',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id'
      });

    if (upsertError) {
      console.error('[Instagram OAuth Callback] Erro ao salvar integração:', upsertError);
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(upsertError.message)}`);
    }

    console.log('[Instagram OAuth Callback] Integração salva com sucesso!');

    // 6. Redirecionar para página de sucesso
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_success=true`);

  } catch (err) {
    console.error('[Instagram OAuth Callback] Erro inesperado:', err);
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=erro_inesperado`);
  }
});
