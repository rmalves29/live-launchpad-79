import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId } = await req.json();
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const APP_ID = Deno.env.get('FACEBOOK_APP_ID');
    const CONFIG_ID = Deno.env.get('WHATSAPP_EMBEDDED_CONFIG_ID');
    const REDIRECT_URI = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-official-auth-callback';

    if (!APP_ID) {
      return new Response(JSON.stringify({ error: 'FACEBOOK_APP_ID não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const scopes = ['whatsapp_business_management', 'whatsapp_business_messaging', 'business_management'].join(',');
    const params = new URLSearchParams({
      client_id: APP_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: scopes,
      state: tenantId,
    });
    if (CONFIG_ID) {
      params.set('config_id', CONFIG_ID);
      params.set('override_default_response_type', 'true');
    }

    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
    return new Response(JSON.stringify({ url: oauthUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[whatsapp-official-oauth-url]', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
