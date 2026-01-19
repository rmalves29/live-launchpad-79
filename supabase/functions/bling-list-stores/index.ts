import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tenant_id } = await req.json();

    // Buscar token do tenant
    const { data: integration, error: intError } = await supabase
      .from('integration_bling')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .single();

    if (intError || !integration?.access_token) {
      return new Response(JSON.stringify({ error: 'Integração Bling não encontrada ou sem token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const accessToken = integration.access_token;

    // Buscar canais de venda
    console.log('[bling-list-stores] Buscando canais de venda...');
    const canaisRes = await fetch(`${BLING_API_URL}/canais-venda?pagina=1&limite=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    const canaisData = await canaisRes.json();

    // Buscar situações de módulos
    const situacoesRes = await fetch(`${BLING_API_URL}/situacoes/modulos`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    const situacoesData = await situacoesRes.json();

    console.log('[bling-list-stores] Canais:', JSON.stringify(canaisData));
    console.log('[bling-list-stores] Situações:', JSON.stringify(situacoesData));

    return new Response(JSON.stringify({
      canais: canaisData?.data || [],
      situacoes: situacoesData?.data || [],
      rawCanais: canaisData,
      rawSituacoes: situacoesData
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[bling-list-stores] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
