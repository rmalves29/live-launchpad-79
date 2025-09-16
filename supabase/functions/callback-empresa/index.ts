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
          // Processar código de autorização do Bling
          response = {
            ...response,
            message: 'Autorização Bling recebida',
            code,
            state
          };

          // Chamar função para trocar código por token
          // Assumindo que o tenant_id está no state ou pode ser obtido de outra forma
          try {
            const oauthResponse = await supabase.functions.invoke('bling-oauth', {
              body: {
                action: 'exchange_code',
                code: code,
                tenant_id: state // Usando state como tenant_id por enquanto
              }
            });

            const oauthResult = oauthResponse.data;
            console.log('OAuth exchange result:', oauthResponse.status, oauthResult);

            // Log do resultado
            const oauthLogData = {
              webhook_type: 'bling_oauth_exchange',
              payload: {
                action: 'exchange_code',
                code: code,
                state: state,
                oauth_status: oauthResponse.status,
                oauth_response: oauthResult
              },
              status_code: oauthResponse.status,
              response: `OAuth exchange: ${oauthResult}`,
              tenant_id: state
            };

            await supabase.from('webhook_logs').insert(oauthLogData);

            if (!oauthResponse.error) {
              response.message = 'Autorização Bling processada com sucesso';
            } else {
              response.message = `Erro ao processar autorização: ${JSON.stringify(oauthResponse.error)}`;
            }

          } catch (error) {
            console.error('Erro ao processar OAuth:', error);
            response.message = `Erro ao processar autorização: ${error.message}`;
          }
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