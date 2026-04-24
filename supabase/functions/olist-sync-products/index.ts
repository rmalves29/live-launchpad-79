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
        JSON.stringify({ error: 'tenant_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        JSON.stringify({ error: 'Integração Olist não configurada ou sem token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.sync_products) {
      return new Response(
        JSON.stringify({ error: 'Sincronização de produtos desativada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[olist-sync-products] Iniciando sync para tenant: ${tenant_id}`);

    // Buscar produtos do Olist
    let allProducts: any[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const apiUrl = `${OLIST_API_URL}/produtos?limit=${limit}&offset=${offset}`;
      console.log(`[olist-sync-products] Chamando API: ${apiUrl}`);

      const productsResponse = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${integration.access_token}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!productsResponse.ok) {
        const errorText = await productsResponse.text();
        console.error(`[olist-sync-products] Erro HTTP ${productsResponse.status}:`, errorText);

        if (productsResponse.status === 401) {
          return new Response(
            JSON.stringify({ error: 'Token expirado. Renove o token e tente novamente.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        break;
      }

      const rawText = await productsResponse.text();
      console.log(`[olist-sync-products] Resposta bruta (primeiros 500 chars): ${rawText.substring(0, 500)}`);

      let productsData: any;
      try {
        productsData = JSON.parse(rawText);
      } catch (e) {
        console.error('[olist-sync-products] Erro ao parsear JSON:', e);
        break;
      }

      // Log de todas as chaves do response para debug
      console.log(`[olist-sync-products] Chaves do response: ${Object.keys(productsData).join(', ')}`);

      // A API v3 do Olist retorna "itens" como array de produtos
      // Mas pode também retornar "data" ou o array diretamente
      const products = productsData.itens || productsData.data || productsData.produtos || (Array.isArray(productsData) ? productsData : []);

      console.log(`[olist-sync-products] Produtos nesta página: ${products.length}`);

      if (products.length === 0) break;

      allProducts = [...allProducts, ...products];

      if (products.length < limit) break;

      offset += limit;
      await delay(2000); // Rate limit
    }

    console.log(`[olist-sync-products] ${allProducts.length} produtos encontrados`);

    let synced = 0;
    let errors = 0;

    for (const product of allProducts) {
      try {
        const code = product.codigo || `OLIST-${product.id}`;
        const name = product.nome || 'Produto sem nome';
        const price = product.preco || 0;

        // Verificar se produto já existe pelo código
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('tenant_id', tenant_id)
          .eq('code', code)
          .maybeSingle();

        if (existing) {
          // Atualizar produto existente
          const { error: updateError } = await supabase
            .from('products')
            .update({
              name,
              price,
              stock: product.estoqueAtual ?? 0,
              is_active: product.situacao === 'A',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updateError) {
            console.error(`[olist-sync-products] Erro ao atualizar produto ${code}:`, updateError);
            errors++;
          } else {
            synced++;
          }
        } else {
          // Inserir novo produto
          const { error: insertError } = await supabase
            .from('products')
            .insert({
              tenant_id,
              code,
              name,
              price,
              stock: product.estoqueAtual ?? 0,
              is_active: product.situacao === 'A',
              sale_type: 'BAZAR',
              image_url: product.urlImagem || null,
            });

          if (insertError) {
            console.error(`[olist-sync-products] Erro ao inserir produto ${code}:`, insertError);
            errors++;
          } else {
            synced++;
          }
        }

        await delay(100); // Small delay between DB operations
      } catch (e) {
        console.error(`[olist-sync-products] Erro ao processar produto:`, e);
        errors++;
      }
    }

    // Atualizar last_sync_at
    await supabase
      .from('integration_olist')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id);

    console.log(`[olist-sync-products] Sync finalizado: ${synced} sincronizados, ${errors} erros`);

    return new Response(
      JSON.stringify({ success: true, synced, errors, total: allProducts.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[olist-sync-products] Erro:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
