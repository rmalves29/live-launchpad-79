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

    // Criar cliente Supabase primeiro para buscar credenciais
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Usar o state como tenant_id
    const tenant_id = state || '3c92bf57-a114-4690-b4cf-642078fc9df9';
    
    // 1) Buscar credenciais do banco de dados
    const { data: blingConfig, error: configError } = await supabase
      .from('bling_integrations')
      .select('client_id, client_secret')
      .eq('tenant_id', tenant_id)
      .single();

    if (configError || !blingConfig) {
      console.error('Erro ao buscar config Bling:', configError);
      return new Response(JSON.stringify({ step:'config', error:'Bling integration not configured for tenant' }),
        { status:400, headers:{ ...corsHeaders, 'Content-Type':'application/json' }});
    }

    const clientId = blingConfig.client_id;
    const clientSecret = blingConfig.client_secret;

    console.log('[bling oauth] tenant=', tenant_id, 'id_prefix=', clientId?.slice(0,8), 'secret_len=', clientSecret?.length);

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ step:'token', error:'Missing client credentials in database' }),
        { status:400, headers:{ ...corsHeaders, 'Content-Type':'application/json' }});
    }

    // 2) Basic Auth (somente no header)
    const basic = btoa(`${clientId}:${clientSecret}`);

    // 3) Body SEM credenciais (redirect_uri é opcional p/ Bling)
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code
      // se quiser manter: redirect_uri
      // redirect_uri: redirectUri
    });

    // 4) Endpoint + headers conforme manual
    const tokenResponse = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '1.0'
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

    // 2) Salvar tokens no DB (cliente já criado acima)

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
    return Response.redirect('https://app.orderzaps.com/integracoes?bling=ok', 302);

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