import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.orderzaps.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code, client_id, client_secret, redirect_uri, api_base_url } = await req.json();
    
    console.log('OAuth action:', action);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'exchange_code') {
      if (!code || !client_id || !client_secret || !redirect_uri) {
        return new Response(
          JSON.stringify({ error: 'Parâmetros obrigatórios não informados' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Determine correct URLs based on environment
      const isProduction = !api_base_url || api_base_url.includes('melhorenvio.com.br/api');
      const tokenUrl = isProduction 
        ? 'https://melhorenvio.com.br/oauth/token'
        : 'https://sandbox.melhorenvio.com.br/oauth/token';
      
      const tokenPayload = {
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        redirect_uri,
        code,
      };

      console.log('Requesting token from:', tokenUrl);
      console.log('Token payload:', { ...tokenPayload, client_secret: '***' });

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'OrderZaps (contato@orderzaps.com)',
        },
        body: JSON.stringify(tokenPayload),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('Token exchange error:', tokenResponse.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao trocar código por token',
            details: errorData 
          }),
          { 
            status: tokenResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const tokenData = await tokenResponse.json();
      console.log('Token received successfully');

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

      // Update config with tokens
      const { error: updateError } = await supabase
        .from('frete_config')
        .upsert({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt.toISOString(),
        }, { onConflict: 'id' });

      if (updateError) {
        console.error('Error updating config:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao salvar tokens' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Token obtido e salvo com sucesso',
          expires_at: expiresAt.toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'refresh_token') {
      // Get current config
      const { data: configData, error: configError } = await supabase
        .from('frete_config')
        .select('*')
        .limit(1)
        .single();

      if (configError || !configData) {
        return new Response(
          JSON.stringify({ error: 'Configuração não encontrada' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (!configData.refresh_token) {
        return new Response(
          JSON.stringify({ error: 'Refresh token não encontrado' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Use correct refresh URL based on environment
      const isProduction = !configData.api_base_url || configData.api_base_url.includes('melhorenvio.com.br/api');
      const refreshUrl = isProduction 
        ? 'https://melhorenvio.com.br/oauth/token'
        : 'https://sandbox.melhorenvio.com.br/oauth/token';
      
      const refreshPayload = {
        grant_type: 'refresh_token',
        client_id: configData.client_id,
        client_secret: configData.client_secret,
        refresh_token: configData.refresh_token,
      };

      console.log('Refreshing token from:', refreshUrl);

      const refreshResponse = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'OrderZaps (contato@orderzaps.com)',
        },
        body: JSON.stringify(refreshPayload),
      });

      if (!refreshResponse.ok) {
        const errorData = await refreshResponse.text();
        console.error('Token refresh error:', refreshResponse.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao renovar token',
            details: errorData 
          }),
          { 
            status: refreshResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const refreshData = await refreshResponse.json();
      console.log('Token refreshed successfully');

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + refreshData.expires_in);

      // Update config with new tokens
      const { error: updateError } = await supabase
        .from('frete_config')
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token || configData.refresh_token,
          token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', configData.id);

      if (updateError) {
        console.error('Error updating config:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao salvar novos tokens' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Token renovado com sucesso',
          expires_at: expiresAt.toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não reconhecida' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in melhor-envio-oauth function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});