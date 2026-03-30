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
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorReason = url.searchParams.get('error_reason');

  const APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://live-launchpad-79.lovable.app').replace(/\/+$/, '');
  const FB_APP_ID = Deno.env.get('INSTAGRAM_APP_ID');
  const FB_APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET');
  const REDIRECT_URI = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/instagram-auth-callback';

  console.log('[Instagram Callback] Received request:', { code: code ? 'present' : 'missing', state, error, errorReason });

  if (error) {
    console.log('[Instagram Callback] OAuth error:', error, errorReason);
    return Response.redirect(`${APP_URL}/integracoes?instagram_error=${encodeURIComponent(errorReason || error)}`);
  }

  if (!code || !state) {
    console.log('[Instagram Callback] Missing code or state');
    return Response.redirect(`${APP_URL}/integracoes?instagram_error=parametros_ausentes`);
  }

  if (!FB_APP_ID || !FB_APP_SECRET) {
    console.error('[Instagram Callback] Missing INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET');
    return Response.redirect(`${APP_URL}/integracoes?instagram_error=credenciais_nao_configuradas`);
  }

  try {
    console.log('[Instagram Callback] Exchanging code for token...');
    const tokenFormData = new FormData();
    tokenFormData.append('client_id', FB_APP_ID);
    tokenFormData.append('client_secret', FB_APP_SECRET);
    tokenFormData.append('grant_type', 'authorization_code');
    tokenFormData.append('redirect_uri', REDIRECT_URI);
    tokenFormData.append('code', code);

    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: tokenFormData,
    });

    const tokenData = await tokenResponse.json();
    console.log('[Instagram Callback] Token response status:', tokenResponse.status, 'hasError:', !!tokenData.error_message);

    if (tokenData.error_message) {
      console.error('[Instagram Callback] Token error:', tokenData.error_message, tokenData.error_type);
      return Response.redirect(`${APP_URL}/integracoes?instagram_error=${encodeURIComponent(tokenData.error_message)}`);
    }

    const shortLivedToken = tokenData.access_token;
    const oauthUserId = tokenData.user_id;
    console.log('[Instagram Callback] Got short-lived token for user:', oauthUserId);

    // Tentar obter long-lived token, mas usar short-lived se falhar
    let finalToken = shortLivedToken;
    try {
      const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${FB_APP_SECRET}&access_token=${shortLivedToken}`;
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json();

      if (longLivedData.access_token) {
        finalToken = longLivedData.access_token;
        console.log('[Instagram Callback] Got long-lived token successfully');
      } else {
        console.warn('[Instagram Callback] Long-lived token failed, using short-lived token:', longLivedData.error || longLivedData);
      }
    } catch (llErr) {
      console.warn('[Instagram Callback] Long-lived token request failed, using short-lived token:', llErr);
    }

    let instagramUsername = '';
    let instagramAccountId = oauthUserId?.toString() || '';

    try {
      const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${finalToken}`);
      const meData = await meRes.json();
      console.log('[Instagram Callback] /me response:', JSON.stringify(meData));

      if (meData?.id) {
        instagramAccountId = String(meData.id);
      }

      if (meData?.username) {
        instagramUsername = String(meData.username);
      }
    } catch (meErr) {
      console.error('[Instagram Callback] Erro ao buscar dados via /me:', meErr);
    }

    console.log('[Instagram Callback] Final account/user:', instagramAccountId || '(não obtido)');
    console.log('[Instagram Callback] Final username:', instagramUsername || '(não obtido)');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: upsertError } = await supabase
      .from('integration_instagram')
      .upsert({
        tenant_id: state,
        instagram_account_id: instagramAccountId || (oauthUserId ? String(oauthUserId) : null),
        access_token: finalToken,
        instagram_username: instagramUsername || null,
        is_active: true,
        environment: 'production',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id'
      });

    if (upsertError) {
      console.error('[Instagram Callback] Upsert error:', upsertError);
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(upsertError.message)}`);
    }

    console.log('[Instagram Callback] Success! Redirecting...');
    return Response.redirect(`${APP_URL}/integracoes?instagram_success=true`);

  } catch (err) {
    console.error('[Instagram Callback] Unexpected error:', err);
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=erro_inesperado`);
  }
});
