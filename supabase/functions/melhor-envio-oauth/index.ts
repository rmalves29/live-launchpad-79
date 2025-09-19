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

    const { code, tenant_id } = await req.json();

    console.log('🔄 Processando OAuth do Melhor Envio:', {
      code: code ? `${code.substring(0, 10)}...` : 'não fornecido',
      tenant_id
    });

    if (!code || !tenant_id) {
      throw new Error('Parâmetros obrigatórios: code, tenant_id');
    }

    // Usar credenciais fixas de produção conforme as instruções
    const client_id = '20128';
    const client_secret = Deno.env.get('MELHOR_ENVIO_CLIENT_SECRET');
    
    if (!client_secret) {
      throw new Error('MELHOR_ENVIO_CLIENT_SECRET environment variable not configured');
    }

    // Sempre usar produção conforme instruções
    const tokenUrl = 'https://melhorenvio.com.br/oauth/token';
    const redirectUri = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa?service=melhorenvio&action=oauth';

    console.log('📡 Fazendo requisição para obter access token:', {
      tokenUrl,
      redirectUri,
      client_id
    });

    // Usar application/x-www-form-urlencoded conforme instruções
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', redirectUri);
    params.set('client_id', client_id);
    params.set('client_secret', client_secret);

    // Trocar code por access token
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
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
        sandbox: false, // Sempre produção conforme instruções
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