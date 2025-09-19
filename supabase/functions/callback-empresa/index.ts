import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const service = url.searchParams.get('service');
    const action = url.searchParams.get('action');
    
    console.log('🔄 Callback empresa recebido:', {
      service,
      action,
      url: req.url
    });

    if (service === 'melhorenvio' && action === 'oauth') {
      return await handleMelhorEnvioOAuth(req, url);
    }

    return new Response('Service not supported', { status: 400 });

  } catch (error) {
    console.error('❌ Erro no callback empresa:', error);
    
    // Redirect to error page with reason
    const reason = encodeURIComponent(error.message || 'callback_processing_failed');
    return new Response(null, {
      status: 302,
      headers: { 
        Location: `https://live-launchpad-79.lovable.app/integracoes?melhorenvio=config_error&reason=${reason}` 
      }
    });
  }
});

async function handleMelhorEnvioOAuth(req: Request, url: URL) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const code = url.searchParams.get('code');
  const tenantId = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  console.log('📋 Parâmetros do OAuth:', {
    code: code ? `${code.substring(0, 10)}...` : 'não fornecido',
    tenantId,
    error,
    errorDescription
  });

  // Se houve erro na autorização
  if (error) {
    throw new Error(`OAuth error: ${error} - ${errorDescription || 'Unknown error'}`);
  }

  if (!code || !tenantId) {
    throw new Error('Missing required parameters: code and state (tenant_id)');
  }

  // Buscar configurações do tenant
  const { data: integration, error: integrationError } = await supabase
    .from('shipping_integrations')
    .select('client_id, client_secret, sandbox')
    .eq('tenant_id', tenantId)
    .eq('provider', 'melhor_envio')
    .single();

  if (integrationError || !integration) {
    throw new Error('Integration configuration not found for tenant');
  }

  const { client_id, client_secret, sandbox } = integration;

  // Determinar URL baseado no ambiente
  const tokenUrl = sandbox 
    ? 'https://sandbox.melhorenvio.com.br/oauth/token'
    : 'https://melhorenvio.com.br/oauth/token';

  // Montar redirect_uri exatamente como usado no authorize
  const redirectUri = `${url.origin}/functions/v1/callback-empresa?service=melhorenvio&action=oauth`;

  console.log('📡 Fazendo requisição para obter access token:', {
    tokenUrl,
    redirectUri,
    sandbox,
    client_id
  });

  // 🟢 Body OAUTH padrão: x-www-form-urlencoded
  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('redirect_uri', redirectUri);

  // 🟢 Client auth no header (forma mais compatível)
  const basic = 'Basic ' + btoa(`${client_id}:${client_secret}`);

  // Trocar code por access token
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': basic
    },
    body: params.toString()
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('❌ Erro na requisição do token:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      error: errorText
    });
    
    let errorReason = 'token_exchange_failed';
    try {
      const errorData = JSON.parse(errorText);
      errorReason = errorData.error || errorReason;
    } catch {
      // Keep default error reason
    }
    
    throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorReason}`);
  }

  const tokenData = await tokenResponse.json();
  console.log('✅ Token obtido com sucesso:', {
    access_token: tokenData.access_token ? `${tokenData.access_token.substring(0, 20)}...` : 'não fornecido',
    token_type: tokenData.token_type,
    expires_in: tokenData.expires_in,
    refresh_token: tokenData.refresh_token ? `${tokenData.refresh_token.substring(0, 20)}...` : 'não fornecido',
    scope: tokenData.scope
  });

  // Calcular data de expiração
  const expiresAt = tokenData.expires_in ? 
    new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString() : 
    null;

  // Salvar/atualizar a integração no banco
  const { data: integrationData, error: saveError } = await supabase
    .from('shipping_integrations')
    .upsert({
      tenant_id: tenantId,
      provider: 'melhor_envio',
      client_id,
      client_secret,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      scope: tokenData.scope,
      expires_at: expiresAt,
      sandbox,
      is_active: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'tenant_id,provider',
      ignoreDuplicates: false
    })
    .select();

  if (saveError) {
    console.error('❌ Erro ao salvar integração:', saveError);
    throw new Error(`Failed to save integration: ${saveError.message}`);
  }

  console.log('💾 Integração salva com sucesso:', integrationData);

  // Redirect to success page
  return new Response(null, {
    status: 302,
    headers: { 
      Location: 'https://live-launchpad-79.lovable.app/integracoes?melhorenvio=ok' 
    }
  });
}
