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

    const url = new URL(req.url);
    const service = url.searchParams.get('service') || 'unknown';
    const action = url.searchParams.get('action') || 'callback';
    
    // Capturar todos os parâmetros da query string
    const allParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      allParams[key] = value;
    });

    // Capturar corpo da requisição se houver
    let body = null;
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        body = await req.text();
      }
    }

    // Log detalhado do callback
    const logData = {
      webhook_type: `callback_${service}`,
      payload: {
        method: req.method,
        service,
        action,
        query_params: allParams,
        body,
        headers: Object.fromEntries(req.headers.entries()),
        timestamp: new Date().toISOString(),
        url: req.url
      },
      status_code: 200,
      response: 'Callback recebido com sucesso'
    };

    // Salvar log no banco
    const { error: logError } = await supabase
      .from('webhook_logs')
      .insert(logData);

    if (logError) {
      console.error('Erro ao salvar log:', logError);
    }

    // Processar callbacks específicos
    let response = { message: 'Callback recebido com sucesso', service, action };

    if (service === 'bling') {
      // Processar callback específico do Bling
      if (action === 'oauth') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        
        if (code) {
          // Aqui você pode processar o código de autorização do Bling
          response = {
            ...response,
            message: 'Autorização Bling recebida',
            code,
            state
          };
        }
      }
    }

    console.log(`Callback recebido - Service: ${service}, Action: ${action}`, allParams);

    return new Response(
      JSON.stringify(response),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
        status: 200
      }
    );

  } catch (error) {
    console.error('Erro no callback:', error);
    
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