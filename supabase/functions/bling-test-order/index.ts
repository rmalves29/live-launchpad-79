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

    const { tenant_id, bling_order_id, numero, action, bling_product_id, product_code, product_price } = await req.json();

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
    const blingStoreId = integration.bling_store_id;
    const results: any = { timestamp: new Date().toISOString() };

    // TEST: Search product by code
    if (action === 'search_product' && product_code) {
      console.log(`[bling-test] Searching product by code: ${product_code}`);
      
      const searchRes = await fetch(`${BLING_API_URL}/produtos?pagina=1&limite=10&codigo=${encodeURIComponent(product_code)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      const searchText = await searchRes.text();
      console.log(`[bling-test] Search response: ${searchRes.status} - ${searchText}`);
      
      results.searchProduct = {
        status: searchRes.status,
        code: product_code,
        response: JSON.parse(searchText)
      };
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // TEST: Link product to store
    if (action === 'test_link_store' && bling_product_id && blingStoreId) {
      console.log(`[bling-test] Testing link product ${bling_product_id} to store ${blingStoreId}`);
      
      const payload = {
        idProduto: bling_product_id,
        loja: { id: blingStoreId },
        preco: product_price || 0,
        codigo: product_code || `PROD-${bling_product_id}`
      };
      
      console.log('[bling-test] Link payload:', JSON.stringify(payload, null, 2));
      
      const linkRes = await fetch(`${BLING_API_URL}/produtos/lojas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const linkText = await linkRes.text();
      console.log(`[bling-test] Link response: ${linkRes.status} - ${linkText}`);
      
      results.linkTest = {
        status: linkRes.status,
        payload,
        response: linkText
      };
      
      return new Response(JSON.stringify(results, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1) Buscar por ID do Bling (se fornecido)
    if (bling_order_id) {
      console.log(`[bling-test] Buscando por bling_order_id: ${bling_order_id}`);
      const res = await fetch(`${BLING_API_URL}/pedidos/vendas/${bling_order_id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      const orderData = await res.json();
      results.byId = {
        status: res.status,
        data: orderData
      };
      
      // Se o pedido tem uma NF-e vinculada, buscar dados fiscais
      const nfId = orderData?.data?.notaFiscal?.id;
      if (nfId) {
        console.log(`[bling-test] Pedido tem NF-e vinculada: ${nfId}, buscando detalhes...`);
        const nfRes = await fetch(`${BLING_API_URL}/nfe/${nfId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });
        results.notaFiscal = {
          status: nfRes.status,
          data: await nfRes.json()
        };
      }
    }

    // 2) Buscar por número (se fornecido)
    if (numero) {
      console.log(`[bling-test] Buscando por numero: ${numero}`);
      const res = await fetch(`${BLING_API_URL}/pedidos/vendas?pagina=1&limite=10&numero=${encodeURIComponent(String(numero))}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      results.byNumero = {
        status: res.status,
        data: await res.json()
      };
    }

    // 3) Listar últimos pedidos para verificar se existem pedidos
    console.log(`[bling-test] Listando últimos 5 pedidos`);
    const listRes = await fetch(`${BLING_API_URL}/pedidos/vendas?pagina=1&limite=5`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    results.lastOrders = {
      status: listRes.status,
      data: await listRes.json()
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[bling-test] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
