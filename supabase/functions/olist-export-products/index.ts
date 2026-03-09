import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OLIST_API_URL = 'https://api.tiny.com.br/public-api/v3';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tenant_id } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'tenant_id é obrigatório' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar integração
    const { data: integration, error: intError } = await supabase
      .from('integration_olist')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    if (intError || !integration?.access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração Olist não configurada ou sem token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.sync_products) {
      return new Response(
        JSON.stringify({ success: false, error: 'Módulo de produtos desativado' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[olist-export-products] Iniciando exportação para tenant: ${tenant_id}`);

    // Buscar produtos do OrderZap
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);

    if (prodError) {
      console.error('[olist-export-products] Erro ao buscar produtos:', prodError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar produtos do banco' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ success: true, exported: 0, errors: 0, total: 0, message: 'Nenhum produto ativo para exportar' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[olist-export-products] ${products.length} produtos para exportar`);

    let exported = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const product of products) {
      try {
        // Montar payload conforme API v3 do Olist
        const olistProduct: Record<string, any> = {
          sku: product.code || `OZ-${product.id}`,
          descricao: product.name,
          tipo: 'P', // Produto
          unidade: 'UN',
          precos: {
            preco: product.price || 0,
          },
          estoque: {
            controlar: true,
            inicial: product.stock || 0,
          },
        };

        // Adicionar imagem se existir
        if (product.image_url) {
          olistProduct.anexos = [{ url: product.image_url, externo: true }];
        }

        console.log(`[olist-export-products] Exportando: ${product.code} - ${product.name}`);

        const response = await fetch(`${OLIST_API_URL}/produtos`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${integration.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(olistProduct),
        });

        const responseText = await response.text();

        if (!response.ok) {
          console.error(`[olist-export-products] Erro HTTP ${response.status} para ${product.code}:`, responseText);

          if (response.status === 401) {
            return new Response(
              JSON.stringify({ success: false, error: 'Token expirado. Renove o token e tente novamente.', exported, errors }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Verificar se é erro de produto duplicado (já existe)
          if (response.status === 409 || responseText.includes('duplicad') || responseText.includes('já existe') || responseText.includes('already exists')) {
            console.log(`[olist-export-products] Produto ${product.code} já existe no Olist, pulando...`);
            exported++; // Conta como processado
          } else {
            errors++;
            errorDetails.push(`${product.code}: ${responseText.substring(0, 100)}`);
          }
        } else {
          let responseData;
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = {};
          }
          console.log(`[olist-export-products] Produto ${product.code} exportado com sucesso. Olist ID: ${responseData.id || 'N/A'}`);
          exported++;
        }

        await delay(2000); // Rate limit - 30 req/min
      } catch (e) {
        console.error(`[olist-export-products] Erro ao exportar produto ${product.code}:`, e);
        errors++;
        errorDetails.push(`${product.code}: ${e.message}`);
      }
    }

    // Atualizar last_sync_at
    await supabase
      .from('integration_olist')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id);

    console.log(`[olist-export-products] Exportação finalizada: ${exported} exportados, ${errors} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        exported,
        errors,
        total: products.length,
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[olist-export-products] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
