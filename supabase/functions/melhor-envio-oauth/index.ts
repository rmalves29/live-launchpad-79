import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    // Handle callback from URL params (OAuth redirect)
    if (code) {
      console.log('ME OAuth callback received:', { code, state });

      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const tenant_id = state || '08f2b1b9-3988-489e-8186-c60f0c0b0622'; // Default tenant from user's request

      // Get ME integration config for tenant
      const { data: integration, error: integrationError } = await supabase
        .from('integration_me')
        .select('client_id, client_secret, environment')
        .eq('tenant_id', tenant_id)
        .single();

      if (integrationError || !integration) {
        console.error('ME integration not found for tenant:', tenant_id);
        return new Response(
          JSON.stringify({ error: 'Integração ME não encontrada para o tenant' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (!integration.client_id || !integration.client_secret) {
        return new Response(
          JSON.stringify({ error: 'Client ID/Secret não configurados' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
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

      console.log('Requesting token from:', tokenUrl);
      console.log('Using Basic auth for client:', integration.client_id.slice(0, 8));

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
        },
        body
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
          tenant_id,
          environment: integration.environment
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle JSON requests for refresh_token action
    const { action } = await req.json();
    console.log('OAuth action:', action);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'refresh_token') {
      const tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622'; // Default tenant from user's request
      
      // Get current integration
      const { data: integration, error: integrationError } = await supabase
        .from('integration_me')
        .select('*')
        .eq('tenant_id', tenant_id)
        .single();

      if (integrationError || !integration) {
        return new Response(
          JSON.stringify({ error: 'Integração ME não encontrada' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (!integration.refresh_token) {
        return new Response(
          JSON.stringify({ error: 'Refresh token não encontrado' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (!integration.client_id || !integration.client_secret) {
        return new Response(
          JSON.stringify({ error: 'Client ID/Secret não configurados' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Use correct refresh URL based on environment
      const isProduction = integration.environment === 'production';
      const refreshUrl = isProduction 
        ? 'https://melhorenvio.com.br/oauth/token'
        : 'https://sandbox.melhorenvio.com.br/oauth/token';
      
      // Use Basic Auth and form-urlencoded for refresh
      const basic = btoa(`${integration.client_id}:${integration.client_secret}`);
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token
      });

      console.log('Refreshing token from:', refreshUrl);

      const refreshResponse = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
        },
        body
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

      // Update integration with new tokens (ME rotates refresh tokens)
      const { error: updateError } = await supabase
        .from('integration_me')
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token || integration.refresh_token, // Use new refresh token if provided
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant_id);

      if (updateError) {
        console.error('Error updating integration:', updateError);
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
          tenant_id
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