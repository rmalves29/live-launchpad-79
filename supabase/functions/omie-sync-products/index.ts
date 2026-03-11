import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'tenant_id é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: integration, error: intError } = await supabase
      .from('integration_omie')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração Omie não encontrada ou inativa' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { app_key, app_secret, omie_empresa_id } = integration;
    if (!app_key || !app_secret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Credenciais Omie não configuradas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let page = 1;
    let totalSynced = 0;
    let totalPages = 1;
    const pageSize = 50;

    while (page <= totalPages) {
      const params: any = { 
        pagina: page, 
        registros_por_pagina: pageSize, 
        apenas_importado_api: 'N' 
      };

      // Filtrar por empresa se selecionada
      if (omie_empresa_id) {
        params.filtrar_por_empresa = omie_empresa_id;
      }

      const omieResponse = await fetch(`${OMIE_API_URL}/geral/produtos/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ListarProdutos',
          app_key,
          app_secret,
          param: [params],
        }),
      });

      const omieData = await omieResponse.json();

      if (omieData.faultstring) {
        throw new Error(`Erro Omie: ${omieData.faultstring}`);
      }

      totalPages = omieData.total_de_paginas || 1;
      const products = omieData.produto_servico_cadastro || [];

      for (const prod of products) {
        const code = prod.codigo || prod.codigo_produto?.toString() || `OMIE-${prod.codigo_produto_integracao}`;
        const name = prod.descricao || 'Produto sem nome';
        const price = Number(prod.valor_unitario) || 0;
        const stock = Number(prod.quantidade_estoque) || 0;
        const isActive = prod.inativo !== 'S';

        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('tenant_id', tenant_id)
          .eq('code', code)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('products')
            .update({
              name,
              price,
              stock,
              is_active: isActive,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('products')
            .insert({
              tenant_id,
              code,
              name,
              price,
              stock,
              is_active: isActive,
              sale_type: 'BAZAR',
            });
        }

        totalSynced++;
      }

      page++;
    }

    await supabase
      .from('integration_omie')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id);

    console.log(`[omie-sync-products] Sincronizados ${totalSynced} produtos para tenant ${tenant_id}`);

    return new Response(
      JSON.stringify({ success: true, synced: totalSynced }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[omie-sync-products] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
