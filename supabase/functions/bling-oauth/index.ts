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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, code, tenant_id } = await req.json();

    if (action === 'exchange_code') {
      // Buscar configurações do Bling para o tenant
      const { data: blingConfig, error: configError } = await supabase
        .from('bling_integrations')
        .select('*')
        .eq('tenant_id', tenant_id)
        .single();

      if (configError || !blingConfig) {
        console.error('Bling config not found:', configError);
        return new Response(
          JSON.stringify({ error: 'Configuração do Bling não encontrada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Fazer requisição para trocar código por token usando base URL correta
      const tokenUrl = 'https://api.bling.com.br/Api/v3/oauth/token';

      const tokenData = {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa`
      };

      // Criar Basic Auth header com client_id e client_secret
      const basicAuth = btoa(`${blingConfig.client_id}:${blingConfig.client_secret}`);

      console.log('Requesting Bling token with:', {
        url: tokenUrl,
        grant_type: tokenData.grant_type,
        code: tokenData.code,
        redirect_uri: tokenData.redirect_uri,
        client_id: blingConfig.client_id,
        has_client_secret: !!blingConfig.client_secret
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '1.0', // Header obrigatório conforme especificação
          'Authorization': `Basic ${basicAuth}`
        },
        body: new URLSearchParams(tokenData).toString()
      });

      const tokenResult = await tokenResponse.text();
      console.log('Bling token response:', tokenResponse.status, tokenResult);

      if (!tokenResponse.ok) {
        // Log do erro
        const logError = {
          webhook_type: 'bling_oauth_error',
          payload: {
            action: 'exchange_code',
            tenant_id,
            code,
            error: tokenResult,
            status: tokenResponse.status
          },
          status_code: tokenResponse.status,
          response: `Erro ao trocar código por token: ${tokenResult}`,
          tenant_id
        };

        await supabase.from('webhook_logs').insert(logError);

        return new Response(
          JSON.stringify({ error: 'Erro ao obter token do Bling', details: tokenResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const tokenJson = JSON.parse(tokenResult);
      
      // Calcular data de expiração
      const expiresAt = new Date(Date.now() + (tokenJson.expires_in || 3600) * 1000).toISOString();
      
      // Atualizar configuração do Bling com os tokens
      const { error: updateError } = await supabase
        .from('bling_integrations')
        .update({
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          token_type: tokenJson.token_type || 'Bearer',
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenant_id);

      if (updateError) {
        console.error('Error updating Bling config:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao salvar tokens' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log de sucesso
      const logSuccess = {
        webhook_type: 'bling_oauth_success',
        payload: {
          action: 'exchange_code',
          tenant_id,
          code,
          has_access_token: !!tokenJson.access_token,
          has_refresh_token: !!tokenJson.refresh_token,
          expires_in: tokenJson.expires_in
        },
        status_code: 200,
        response: 'Tokens obtidos e salvos com sucesso',
        tenant_id
      };

      await supabase.from('webhook_logs').insert(logSuccess);

      return new Response(
        JSON.stringify({ 
          message: 'Tokens obtidos com sucesso',
          has_access_token: !!tokenJson.access_token,
          expires_in: tokenJson.expires_in
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (action === 'refresh_token') {
      console.log('Starting refresh token process for tenant:', tenant_id);
      
      // Buscar configuração do Bling
      const { data: blingConfig, error: configError } = await supabase
        .from('bling_integrations')
        .select('*')
        .eq('tenant_id', tenant_id)
        .single();

      console.log('Bling config loaded:', {
        has_config: !!blingConfig,
        config_error: configError,
        has_refresh_token: !!blingConfig?.refresh_token,
        has_client_id: !!blingConfig?.client_id,
        has_client_secret: !!blingConfig?.client_secret
      });

      if (configError || !blingConfig) {
        return new Response(
          JSON.stringify({ error: 'Configuração Bling não encontrada', details: configError }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      if (!blingConfig?.refresh_token) {
        return new Response(
          JSON.stringify({ error: 'Refresh token não encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const refreshUrl = 'https://api.bling.com.br/Api/v3/oauth/token';

      const refreshData = {
        grant_type: 'refresh_token',
        refresh_token: blingConfig.refresh_token
      };

      // Criar Basic Auth header com client_id e client_secret
      const basicAuth = btoa(`${blingConfig.client_id}:${blingConfig.client_secret}`);

      console.log('Making refresh token request to Bling:', {
        url: refreshUrl,
        grant_type: refreshData.grant_type,
        has_refresh_token: !!refreshData.refresh_token,
        client_id: blingConfig.client_id,
        has_client_secret: !!blingConfig.client_secret
      });

      const refreshResponse = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '1.0', // Header obrigatório conforme especificação
          'Authorization': `Basic ${basicAuth}`
        },
        body: new URLSearchParams(refreshData).toString()
      });

      const refreshResult = await refreshResponse.json();
      
      console.log('Bling refresh response:', {
        status: refreshResponse.status,
        ok: refreshResponse.ok,
        result: refreshResult
      });

      if (!refreshResponse.ok) {
        console.error('Bling refresh token error:', refreshResult);
        
        // Log do erro
        await supabase.from('webhook_logs').insert({
          webhook_type: 'bling_refresh_error',
          payload: {
            action: 'refresh_token',
            tenant_id,
            error: refreshResult,
            status: refreshResponse.status
          },
          status_code: refreshResponse.status,
          response: `Erro ao renovar token: ${JSON.stringify(refreshResult)}`,
          tenant_id
        });

        return new Response(
          JSON.stringify({ error: 'Erro ao renovar token', details: refreshResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Calcular nova data de expiração
      const expiresAt = new Date(Date.now() + (refreshResult.expires_in || 3600) * 1000).toISOString();

      // Atualizar tokens
      const { error: updateError } = await supabase
        .from('bling_integrations')
        .update({
          access_token: refreshResult.access_token,
          refresh_token: refreshResult.refresh_token || blingConfig.refresh_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenant_id);

      if (updateError) {
        console.error('Error updating tokens:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao salvar novos tokens', details: updateError }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Log de sucesso
      await supabase.from('webhook_logs').insert({
        webhook_type: 'bling_refresh_success',
        payload: {
          action: 'refresh_token',
          tenant_id,
          has_access_token: !!refreshResult.access_token,
          expires_in: refreshResult.expires_in
        },
        status_code: 200,
        response: 'Token renovado com sucesso',
        tenant_id
      });

      console.log('Token refreshed successfully for tenant:', tenant_id);
      return new Response(
        JSON.stringify({ 
          message: 'Token renovado com sucesso',
          expires_in: refreshResult.expires_in
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não suportada' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('Erro na função Bling OAuth:', error);
    
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});