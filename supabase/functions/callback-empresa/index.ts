import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.orderzaps.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const service = url.searchParams.get('service');
    const action = url.searchParams.get('action');
    
    if (!code) {
      return new Response('Missing code', { status: 400 });
    }

    console.log('OAuth callback received:', { code, state, service, action });

    // Handle Melhor Envio OAuth
    if (service === 'melhorenvio' && action === 'oauth') {
      return await handleMelhorEnvioCallback(code, state);
    }

    // Default to Bling OAuth for backward compatibility
    const redirectUri = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa';
    
    console.log('IMPORTANTE: Verificar se este redirect_uri está cadastrado no aplicativo Bling:', redirectUri);

    // Criar cliente Supabase primeiro para buscar credenciais
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Usar o state como tenant_id
    const tenant_id = state;
    
    if (!tenant_id) {
      console.error('Missing tenant_id in state parameter');
      return new Response(JSON.stringify({ 
        step: 'config', 
        error: 'Missing tenant_id in state parameter',
        redirect_url: 'https://app.orderzaps.com/integracoes?bling=error'
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('Buscando config Bling para tenant:', tenant_id);
    
    // 1) Buscar credenciais do banco de dados
    const { data: blingConfig, error: configError } = await supabase
      .from('bling_integrations')
      .select('client_id, client_secret')
      .eq('tenant_id', tenant_id)
      .single();

    let clientId, clientSecret;

    if (configError || !blingConfig) {
      console.log('Não encontrou config Bling para tenant:', tenant_id);
      // Usar credenciais padrão se não encontrar no banco (fallback)
      clientId = Deno.env.get('BLING_CLIENT_ID') || '';
      clientSecret = Deno.env.get('BLING_CLIENT_SECRET') || '';
      
      if (!clientId || !clientSecret) {
        console.error('Credenciais não configuradas para tenant:', tenant_id);
        return Response.redirect('https://app.orderzaps.com/integracoes?bling=config_error', 302);
      }
    } else {
      clientId = blingConfig.client_id;
      clientSecret = blingConfig.client_secret;
    }

    console.log('[bling oauth] tenant=', tenant_id, 'id_prefix=', clientId?.slice(0,8), 'secret_len=', clientSecret?.length);

    if (!clientId || !clientSecret) {
      console.error('Missing client credentials in database');
      return Response.redirect('https://app.orderzaps.com/integracoes?bling=credentials_error', 302);
    }

    // 2) Basic Auth (somente no header)
    const basic = btoa(`${clientId}:${clientSecret}`);

    // 3) Body com redirect_uri (obrigatório para evitar redirect_uri_mismatch)
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    });

    // 4) Endpoint + headers conforme manual e requisitos mínimos
    const tokenResponse = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '1.0' // Header obrigatório conforme especificação
      },
      body
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));
    console.log('[bling token] status=', tokenResponse.status, 'body=', tokenData);

    if (!tokenResponse.ok) {
      console.error('Bling token exchange failed:', tokenData);
      
      // Log do erro
      await supabase.from('webhook_logs').insert({
        webhook_type: 'bling_callback_error',
        payload: {
          tenant_id,
          code,
          state,
          error: tokenData,
          status: tokenResponse.status
        },
        status_code: tokenResponse.status,
        response: `Erro no callback: ${JSON.stringify(tokenData)}`,
        tenant_id
      });

      return Response.redirect('https://app.orderzaps.com/integracoes?bling=token_error', 302);
    }

    console.log('Saving tokens to database for tenant:', tenant_id);

    // Calcular data de expiração
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
      
      // Log do erro
      await supabase.from('webhook_logs').insert({
        webhook_type: 'bling_callback_save_error',
        payload: {
          tenant_id,
          error: upsertError
        },
        status_code: 500,
        response: `Erro ao salvar tokens: ${JSON.stringify(upsertError)}`,
        tenant_id
      });

      return Response.redirect('https://app.orderzaps.com/integracoes?bling=save_error', 302);
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
      response: 'Tokens salvos com sucesso via callback',
      tenant_id
    };

    await supabase.from('webhook_logs').insert(logData);

    console.log('Bling OAuth process completed successfully');

    // 3) Redirecionar de volta para a UI com sucesso
    return Response.redirect('https://app.orderzaps.com/integracoes?bling=success', 302);

  } catch (error) {
    console.error('Erro no callback:', error);
    
    return Response.redirect('https://app.orderzaps.com/integracoes?error=unexpected_error', 302);
  }
});

async function handleMelhorEnvioCallback(code: string, state: string) {
  console.log('ME OAuth callback received:', { code, state });

  // Initialize Supabase client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const tenant_id = state || '08f2b1b9-3988-489e-8186-c60f0c0b0622'; // Default tenant from user's request

  // Get ME integration config for tenant
  const { data: integration, error: integrationError } = await supabase
    .from('integration_me')
    .select('client_id, client_secret, environment')
    .eq('tenant_id', tenant_id)
    .single();

  if (integrationError || !integration) {
    console.error('ME integration not found for tenant:', tenant_id);
    return Response.redirect('https://app.orderzaps.com/integracoes?melhorenvio=config_error', 302);
  }

  if (!integration.client_id || !integration.client_secret) {
    console.error('ME client credentials not configured');
    return Response.redirect('https://app.orderzaps.com/integracoes?melhorenvio=credentials_error', 302);
  }

  // Determine correct URLs based on environment
  const isProduction = integration.environment === 'production';
  const tokenUrl = isProduction 
    ? 'https://melhorenvio.com.br/oauth/token'
    : 'https://sandbox.melhorenvio.com.br/oauth/token';
  
  const redirect_uri = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa?service=melhorenvio&action=oauth';

  // Use Basic Auth and form-urlencoded as specified
  const basic = btoa(`${integration.client_id}:${integration.client_secret}`);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri
  });

  console.log('Requesting ME token from:', tokenUrl);
  console.log('Using Basic auth for client:', integration.client_id.slice(0, 8));

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'OrderZaps (contato@orderzaps.com)',
    },
    body
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.text();
    console.error('ME token exchange error:', tokenResponse.status, errorData);
    
    // Log error
    await supabase.from('webhook_logs').insert({
      webhook_type: 'melhor_envio_callback_error',
      payload: { tenant_id, code, state, error: errorData },
      status_code: tokenResponse.status,
      response: errorData,
      tenant_id
    });
    
    return Response.redirect('https://app.orderzaps.com/integracoes?melhorenvio=token_error', 302);
  }

  const tokenData = await tokenResponse.json();
  console.log('ME Token received successfully');

  // Update integration_me table for this tenant
  const { error: updateError } = await supabase
    .from('integration_me')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenant_id);

  if (updateError) {
    console.error('Error updating ME integration:', updateError);
    
    await supabase.from('webhook_logs').insert({
      webhook_type: 'melhor_envio_callback_save_error',
      payload: { tenant_id, error: updateError },
      status_code: 500,
      response: JSON.stringify(updateError),
      tenant_id
    });
    
    return Response.redirect('https://app.orderzaps.com/integracoes?melhorenvio=save_error', 302);
  }

  // Log success
  await supabase.from('webhook_logs').insert({
    webhook_type: 'melhor_envio_oauth_success',
    payload: {
      tenant_id,
      has_access_token: !!tokenData.access_token,
      has_refresh_token: !!tokenData.refresh_token
    },
    status_code: 200,
    response: 'ME Tokens salvos com sucesso via callback',
    tenant_id
  });

  console.log('ME OAuth process completed successfully');
  
  return Response.redirect('https://app.orderzaps.com/integracoes?melhorenvio=success', 302);
}