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
  const FB_APP_ID = Deno.env.get('FACEBOOK_APP_ID');
  const FB_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');
  const REDIRECT_URI = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/instagram-auth-callback';

  if (error) {
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(errorReason || error)}`);
  }

  if (!code || !state) {
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=parametros_ausentes`);
  }

  try {
    const tokenFormData = new FormData();
    tokenFormData.append('client_id', FB_APP_ID!);
    tokenFormData.append('client_secret', FB_APP_SECRET!);
    tokenFormData.append('grant_type', 'authorization_code');
    tokenFormData.append('redirect_uri', REDIRECT_URI);
    tokenFormData.append('code', code);

    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: tokenFormData,
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error_message) {
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(tokenData.error_message)}`);
    }

    const shortLivedToken = tokenData.access_token;
    const instagramUserId = tokenData.user_id;

    const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${FB_APP_SECRET}&access_token=${shortLivedToken}`;

    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(longLivedData.error.message)}`);
    }

    const longLivedToken = longLivedData.access_token;

    // Buscar username do Instagram
    let instagramUsername = '';
    try {
      const profileRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=username&access_token=${longLivedToken}`);
      const profileData = await profileRes.json();
      if (profileData.username) {
        instagramUsername = profileData.username;
      }
      console.log('[Instagram Callback] Username:', instagramUsername);
    } catch (profileErr) {
      console.error('[Instagram Callback] Erro ao buscar username:', profileErr);
    }

    // Buscar Page Access Token via Facebook Graph API
    // O token do Instagram Login pode ser usado para buscar as páginas vinculadas
    let pageAccessToken = '';
    let pageId = '';
    try {
      // Primeiro, buscar o Instagram Business Account ID vinculado
      // Usar o user token para buscar as páginas do Facebook do usuário
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedToken}`
      );
      const pagesData = await pagesRes.json();
      console.log('[Instagram Callback] Pages response:', JSON.stringify(pagesData).substring(0, 500));

      if (pagesData.data && pagesData.data.length > 0) {
        // Procurar a página que tem o Instagram Business Account vinculado
        for (const page of pagesData.data) {
          if (page.instagram_business_account) {
            pageAccessToken = page.access_token;
            pageId = page.id;
            console.log(`[Instagram Callback] Found page with IG account: pageId=${pageId}, igAccount=${page.instagram_business_account.id}`);
            break;
          }
        }
        // Se nenhuma página tem IG Business Account, usar a primeira página
        if (!pageAccessToken && pagesData.data[0]?.access_token) {
          pageAccessToken = pagesData.data[0].access_token;
          pageId = pagesData.data[0].id;
          console.log(`[Instagram Callback] Using first page as fallback: pageId=${pageId}`);
        }
      } else {
        console.log('[Instagram Callback] No Facebook pages found for this user');
      }
    } catch (pageErr) {
      console.error('[Instagram Callback] Erro ao buscar page_access_token:', pageErr);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const upsertData: Record<string, any> = {
      tenant_id: state,
      instagram_account_id: instagramUserId.toString(),
      access_token: longLivedToken,
      instagram_username: instagramUsername || null,
      is_active: true,
      environment: 'production',
      updated_at: new Date().toISOString(),
    };

    // Salvar page_access_token e page_id se obtidos
    if (pageAccessToken) {
      upsertData.page_access_token = pageAccessToken;
      console.log('[Instagram Callback] Saving page_access_token');
    }
    if (pageId) {
      upsertData.page_id = pageId;
      console.log('[Instagram Callback] Saving page_id:', pageId);
    }

    const { error: upsertError } = await supabase
      .from('integration_instagram')
      .upsert(upsertData, {
        onConflict: 'tenant_id'
      });

    if (upsertError) {
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(upsertError.message)}`);
    }

    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_success=true`);

  } catch (err) {
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=erro_inesperado`);
  }
});
