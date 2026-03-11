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

    // Listar todas as empresas cadastradas no Omie
    const omieResponse = await fetch('https://app.omie.com.br/api/v1/geral/empresas/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: 'ListarEmpresas',
        app_key,
        app_secret,
        param: [{ pagina: 1, registros_por_pagina: 50 }],
      }),
    });

    const omieData = await omieResponse.json();

    if (omieData.faultstring) {
      console.error('[omie-list-stores] Erro Omie:', omieData.faultstring);
      return new Response(
        JSON.stringify({ success: false, error: omieData.faultstring }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const empresas = (omieData.empresas_cadastro || []).map((emp: any) => ({
      codigo_empresa: emp.codigo_empresa,
      razao_social: emp.razao_social || '',
      nome_fantasia: emp.nome_fantasia || '',
      cnpj: emp.cnpj || '',
      cidade: emp.cidade || '',
      estado: emp.estado || '',
    }));

    console.log(`[omie-list-stores] Encontradas ${empresas.length} empresas`);

    return new Response(
      JSON.stringify({ success: true, empresas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[omie-list-stores] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno ao listar empresas' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
