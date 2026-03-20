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
    // ============ STEP 1: Exchange code for Facebook User Access Token ============
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`;
    
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[Instagram Callback] Token exchange error:', JSON.stringify(tokenData.error));
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(tokenData.error.message || 'Erro ao trocar código')}`);
    }

    const userAccessToken = tokenData.access_token;
    console.log('[Instagram Callback] Got Facebook user access token');

    // ============ STEP 2: Get long-lived user token ============
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${userAccessToken}`;
    
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.error('[Instagram Callback] Long-lived token error:', JSON.stringify(longLivedData.error));
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(longLivedData.error.message || 'Erro ao gerar token de longa duração')}`);
    }

    const longLivedToken = longLivedData.access_token;
    console.log('[Instagram Callback] Got long-lived user token');

    // ============ STEP 3: Get Facebook Pages with Instagram accounts ============
    let pageAccessToken = '';
    let pageId = '';
    let instagramAccountId = '';
    let instagramUsername = '';

    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();
    console.log('[Instagram Callback] Pages response:', JSON.stringify(pagesData).substring(0, 1000));

    if (pagesData.data && pagesData.data.length > 0) {
      // Find the page with an Instagram Business Account
      for (const page of pagesData.data) {
        if (page.instagram_business_account) {
          pageAccessToken = page.access_token;
          pageId = page.id;
          instagramAccountId = page.instagram_business_account.id;
          instagramUsername = page.instagram_business_account.username || '';
          console.log(`[Instagram Callback] Found page: ${page.name}, pageId=${pageId}, igAccount=${instagramAccountId}, username=${instagramUsername}`);
          break;
        }
      }

      // Fallback: use first page if none has IG
      if (!pageAccessToken && pagesData.data[0]?.access_token) {
        pageAccessToken = pagesData.data[0].access_token;
        pageId = pagesData.data[0].id;
        console.log(`[Instagram Callback] Fallback to first page: ${pagesData.data[0].name}`);
      }
    } else {
      console.log('[Instagram Callback] No Facebook pages found');
    }

    // ============ STEP 4: If no username yet, try fetching from IG API ============
    if (!instagramUsername && instagramAccountId) {
      try {
        const igRes = await fetch(`https://graph.facebook.com/v21.0/${instagramAccountId}?fields=username&access_token=${pageAccessToken || longLivedToken}`);
        const igData = await igRes.json();
        if (igData.username) {
          instagramUsername = igData.username;
          console.log('[Instagram Callback] Got username from IG API:', instagramUsername);
        }
      } catch (e) {
        console.error('[Instagram Callback] Error fetching IG username:', e);
      }
    }

    // ============ STEP 5: Get long-lived Page Access Token ============
    if (pageAccessToken && pageId) {
      try {
        const pageLongLivedRes = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${longLivedToken}`
        );
        const pageLongLivedData = await pageLongLivedRes.json();
        if (pageLongLivedData.access_token) {
          pageAccessToken = pageLongLivedData.access_token;
          console.log('[Instagram Callback] Got long-lived page access token');
        }
      } catch (e) {
        console.error('[Instagram Callback] Error getting long-lived page token:', e);
      }
    }

    // ============ STEP 6: Save to database ============
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const upsertData: Record<string, any> = {
      tenant_id: state,
      access_token: longLivedToken,
      instagram_username: instagramUsername || null,
      is_active: true,
      environment: 'production',
      updated_at: new Date().toISOString(),
    };

    if (instagramAccountId) upsertData.instagram_account_id = instagramAccountId;
    if (pageAccessToken) upsertData.page_access_token = pageAccessToken;
    if (pageId) upsertData.page_id = pageId;

    console.log(`[Instagram Callback] Saving: username=${instagramUsername}, igAccountId=${instagramAccountId}, pageId=${pageId}, hasPageToken=${!!pageAccessToken}`);

    const { error: upsertError } = await supabase
      .from('integration_instagram')
      .upsert(upsertData, { onConflict: 'tenant_id' });

    if (upsertError) {
      console.error('[Instagram Callback] Upsert error:', upsertError);
      return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=${encodeURIComponent(upsertError.message)}`);
    }

    console.log('[Instagram Callback] ✅ Integration saved successfully');
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_success=true`);

  } catch (err) {
    console.error('[Instagram Callback] Unexpected error:', err);
    return Response.redirect(`${APP_URL}/config?tab=integracoes&instagram_error=erro_inesperado`);
  }
});
