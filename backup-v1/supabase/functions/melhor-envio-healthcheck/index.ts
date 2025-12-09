import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🏥 Melhor Envio healthcheck chamado');
    
    // Responder sempre 200 para o teste de webhook do Melhor Envio
    return new Response(
      JSON.stringify({ 
        ok: true, 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'Webhook endpoint is working'
      }), 
      { 
        status: 200,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('❌ Erro no healthcheck:', error);
    
    // Mesmo com erro, responder 200 para o teste do ME não falhar
    return new Response(
      JSON.stringify({ 
        ok: true, 
        error: 'Error occurred but responding 200 for webhook test',
        timestamp: new Date().toISOString() 
      }), 
      { 
        status: 200,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});