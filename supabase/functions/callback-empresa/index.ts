import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    
    if (!code) {
      return new Response('Missing code', { status: 400 });
    }

    console.log('Bling OAuth callback received:', { code, state });

    const redirectUri = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa';

    // 1) Trocar code -> tokens
    const clientId = (Deno.env.get('BLING_CLIENT_ID') ?? '').trim();
    const clientSecret = (Deno.env.get('BLING_CLIENT_SECRET') ?? '').trim();
    
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ 
          step: 'token', 
          error: 'Missing env BLING_CLIENT_ID/SECRET' 
        }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Basic base64(client_id:client_secret)
    const basic = btoa(`${clientId}:${clientSecret}`);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    });

    console.log('Requesting Bling token exchange with Basic Auth:', {
      client_id: clientId,
      redirect_uri: redirectUri,
      has_client_secret: !!clientSecret
    });

    const tokenResponse = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));
    console.log('[bling token] status=', tokenResponse.status, 'body=', tokenData);

    if (!tokenResponse.ok) {
      console.error('Bling token exchange failed:', tokenData);
      return new Response(
        JSON.stringify({ 
          step: 'token', 
          status: tokenResponse.status, 
          error: tokenData 
        }), 
        { 
          status: tokenResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 2) Salvar tokens no DB com SERVICE ROLE
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Use o state como tenant_id (ajuste conforme sua lógica)
    const tenant_id = state || '3c92bf57-a114-4690-b4cf-642078fc9df9'; // fallback para o tenant padrão

    console.log('Saving tokens to database for tenant:', tenant_id);

    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();
    
    const { error: upsertError } = await supabase
      .from('bling_integrations')
      .upsert({
        tenant_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type ?? 'Bearer',
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id' });

    if (upsertError) {
      console.error('[bling save tokens] error=', upsertError);
      return new Response(
        JSON.stringify({ step: 'save', error: upsertError }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Log de sucesso
    const logData = {
      webhook_type: 'bling_oauth_success',
      payload: {
        tenant_id,
        has_access_token: !!tokenData.access_token,
        has_refresh_token: !!tokenData.refresh_token,
        expires_in: tokenData.expires_in
      },
      status_code: 200,
      response: 'Tokens salvos com sucesso',
      tenant_id
    };

    await supabase.from('webhook_logs').insert(logData);

    console.log('Bling OAuth process completed successfully');

    // 3) Redirecionar de volta para a UI
    return Response.redirect('https://app.orderzaps.com/configuracoes?bling=ok', 302);

  } catch (error) {
    console.error('Erro no callback Bling:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno do servidor',
        message: error.message 
      }),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
        status: 500
      }
    );
  }
});