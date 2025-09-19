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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { code, tenant_id, client_id, client_secret } = await req.json();

    console.log('🔄 Processando callback OAuth do Melhor Envio:', {
      code: code ? `${code.substring(0, 10)}...` : 'não fornecido',
      tenant_id,
      client_id
    });

    if (!code || !tenant_id || !client_id || !client_secret) {
      throw new Error('Parâmetros obrigatórios: code, tenant_id, client_id, client_secret');
    }

    // Determinar ambiente baseado no client_id
    const sandboxClientIds = ['20128', '20129', '20130', '7017'];
    // Por padrão usar sandbox para desenvolvimento
    const isSandbox = sandboxClientIds.includes(client_id) || true;
    
    const tokenUrl = isSandbox 
      ? 'https://sandbox.melhorenvio.com.br/oauth/token'
      : 'https://melhorenvio.com.br/oauth/token';

    const redirectUri = 'https://live-launchpad-79.lovable.app/integracoes?callback=melhor_envio';

    console.log('📡 Fazendo requisição para obter access token:', {
      tokenUrl,
      redirectUri,
      isSandbox
    });

    // Trocar code por access token
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        redirect_uri: redirectUri,
        code
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Erro na requisição do token:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText
      });
      throw new Error(`Erro ao obter token: ${tokenResponse.status} - ${errorText}`);
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
    const { data: integrationData, error: integrationError } = await supabase
      .from('shipping_integrations')
      .upsert({
        tenant_id,
        provider: 'melhor_envio',
        client_id,
        client_secret,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope,
        expires_at: expiresAt,
        sandbox: isSandbox,
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'tenant_id,provider',
        ignoreDuplicates: false
      })
      .select();

    if (integrationError) {
      console.error('❌ Erro ao salvar integração:', integrationError);
      throw new Error(`Erro ao salvar integração: ${integrationError.message}`);
    }

    console.log('💾 Integração salva com sucesso:', integrationData);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Autorização concluída com sucesso!',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('❌ Erro no processamento OAuth:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});