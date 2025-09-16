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

      // Fazer requisição para trocar código por token
      const tokenUrl = blingConfig.environment === 'production' 
        ? 'https://bling.com.br/Api/v3/oauth/token'
        : 'https://bling.com.br/Api/v3/oauth/token'; // Mesmo endpoint para sandbox

      const tokenData = {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `https://app.orderzaps.com/functions/v1/callback-empresa?service=bling&action=oauth`,
        client_id: blingConfig.client_id,
        client_secret: blingConfig.client_secret
      };

      console.log('Requesting Bling token with:', {
        url: tokenUrl,
        grant_type: tokenData.grant_type,
        code: tokenData.code,
        redirect_uri: tokenData.redirect_uri,
        client_id: tokenData.client_id,
        has_client_secret: !!tokenData.client_secret
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
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
      
      // Atualizar configuração do Bling com os tokens
      const { error: updateError } = await supabase
        .from('bling_integrations')
        .update({
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
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
      // Implementar refresh token se necessário
      const { data: blingConfig } = await supabase
        .from('bling_integrations')
        .select('*')
        .eq('tenant_id', tenant_id)
        .single();

      if (!blingConfig?.refresh_token) {
        return new Response(
          JSON.stringify({ error: 'Refresh token não encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const refreshUrl = blingConfig.environment === 'production' 
        ? 'https://bling.com.br/Api/v3/oauth/token'
        : 'https://bling.com.br/Api/v3/oauth/token';

      const refreshData = {
        grant_type: 'refresh_token',
        refresh_token: blingConfig.refresh_token,
        client_id: blingConfig.client_id,
        client_secret: blingConfig.client_secret
      };

      const refreshResponse = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams(refreshData).toString()
      });

      const refreshResult = await refreshResponse.json();

      if (!refreshResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'Erro ao renovar token', details: refreshResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Atualizar tokens
      await supabase
        .from('bling_integrations')
        .update({
          access_token: refreshResult.access_token,
          refresh_token: refreshResult.refresh_token || blingConfig.refresh_token,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenant_id);

      return new Response(
        JSON.stringify({ message: 'Token renovado com sucesso' }),
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