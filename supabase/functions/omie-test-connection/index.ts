import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, app_key, app_secret } = await req.json();

    if (!app_key || !app_secret) {
      return new Response(
        JSON.stringify({ success: false, error: 'App Key e App Secret são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Testar conexão chamando ListarEmpresas
    const omieResponse = await fetch('https://app.omie.com.br/api/v1/geral/empresas/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: 'ListarEmpresas',
        app_key: app_key,
        app_secret: app_secret,
        param: [{ pagina: 1, registros_por_pagina: 1 }],
      }),
    });

    const omieData = await omieResponse.json();

    if (omieData.faultstring) {
      console.error('[omie-test-connection] Erro Omie:', omieData.faultstring);
      return new Response(
        JSON.stringify({ success: false, error: omieData.faultstring }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const companyName = omieData.empresas_cadastro?.[0]?.razao_social || 
                        omieData.empresas_cadastro?.[0]?.nome_fantasia || 
                        'Empresa identificada';

    return new Response(
      JSON.stringify({ success: true, company_name: companyName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[omie-test-connection] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno ao testar conexão' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
