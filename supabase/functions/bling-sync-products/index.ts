import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

// Helper to delay between requests (Bling limit: 3 req/second)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if error is due to duplicate product code
 */
function isDuplicateCodigoError(payloadText: string): boolean {
  return (
    payloadText.includes('"code":') &&
    payloadText.includes('codigo') &&
    (payloadText.includes('duplicado') || payloadText.includes('já existe') || payloadText.includes('already exists'))
  );
}

/**
 * Find existing Bling product by code
 */
async function findExistingBlingProductByCodigo(accessToken: string, codigo: string): Promise<number | null> {
  const res = await fetch(`${BLING_API_URL}/produtos?pagina=1&limite=1&codigo=${encodeURIComponent(codigo)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  const text = await res.text();
  if (!res.ok) {
    console.log('[bling-sync-products] Could not search existing product in Bling:', res.status, text);
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    const first = parsed?.data?.[0] || parsed?.data?.produtos?.[0] || parsed?.[0];
    const id = first?.id;
    if (typeof id === 'number') return id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
    return null;
  } catch {
    return null;
  }
}

/**
 * Refresh Bling OAuth token
 */
async function refreshBlingToken(supabase: any, integration: any): Promise<string | null> {
  if (!integration.refresh_token || !integration.client_id || !integration.client_secret) {
    console.error('[bling-sync-products] Missing credentials for token refresh');
    return null;
  }

  try {
    const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);

    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[bling-sync-products] Token refresh failed:', errorText);
      return null;
    }

    const tokenData = await response.json();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    await supabase
      .from('integration_bling')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', integration.tenant_id);

    console.log('[bling-sync-products] Token refreshed successfully');
    return tokenData.access_token;
  } catch (error) {
    console.error('[bling-sync-products] Error refreshing token:', error);
    return null;
  }
}

/**
 * Get valid access token, refreshing if needed
 */
async function getValidAccessToken(supabase: any, integration: any): Promise<string | null> {
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000;

    if (expiresAt.getTime() - now.getTime() < bufferMs) {
      console.log('[bling-sync-products] Token expired or expiring soon, refreshing...');
      return await refreshBlingToken(supabase, integration);
    }
  }

  return integration.access_token;
}

type SendProductResult =
  | { kind: 'created'; blingProductId: number; linkedToStore: boolean; raw: any }
  | { kind: 'already_exists'; blingProductId: number; linkedToStore: boolean; raw: any };

/**
 * Link product to store via POST /produtos/lojas
 * This is required because Bling API v3 doesn't accept store in POST /produtos
 * Required fields: idProduto, loja.id, preco, codigo
 */
async function linkProductToStore(
  blingProductId: number, 
  blingStoreId: number, 
  accessToken: string,
  productCode: string,
  productPrice: number
): Promise<boolean> {
  try {
    console.log(`[bling-sync-products] Linking product ${blingProductId} to store ${blingStoreId}...`);
    
    // Bling API v3 requires preco and codigo for /produtos/lojas
    const payload = {
      idProduto: blingProductId,
      loja: {
        id: blingStoreId
      },
      preco: productPrice,
      codigo: productCode
    };

    console.log(`[bling-sync-products] Link payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch(`${BLING_API_URL}/produtos/lojas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log(`[bling-sync-products] Link to store response: ${response.status} - ${responseText}`);

    if (!response.ok) {
      // Check if already linked (409 conflict or similar)
      if (response.status === 409 || responseText.includes('já existe') || responseText.includes('already exists') || responseText.includes('duplicado')) {
        console.log(`[bling-sync-products] Product already linked to store`);
        return true;
      }
      
      // Check for scope error
      if (responseText.includes('insufficient_scope')) {
        console.error(`[bling-sync-products] Missing scope for produtos/lojas - need Lojas Virtuais scope`);
        return false;
      }
      
      console.error(`[bling-sync-products] Failed to link product to store: ${responseText}`);
      return false;
    }

    console.log(`[bling-sync-products] Successfully linked product ${blingProductId} to store ${blingStoreId}`);
    return true;
  } catch (error) {
    console.error(`[bling-sync-products] Error linking product to store:`, error);
    return false;
  }
}

/**
 * Send a single product to Bling API v3
 */
async function sendProductToBling(product: any, accessToken: string, blingStoreId?: number | null): Promise<SendProductResult> {
  // Map local product to Bling API v3 format
  // Required fields: nome, tipo, situacao, formato
  const blingProduct: any = {
    nome: product.name,
    codigo: product.code || product.sku || `PROD-${product.id}`,
    tipo: 'P', // P = Produto, S = Serviço
    situacao: product.is_active !== false ? 'A' : 'I', // A = Ativo, I = Inativo
    formato: 'S', // S = Simples, V = Com variação, E = Com composição
    preco: Number(product.price) || 0,
  };

  // NOTE: Bling API v3 does NOT accept "loja" field in POST /produtos
  // We need to link product to store via separate POST /produtos/lojas endpoint

  // Add optional fields if available
  if (product.description) {
    blingProduct.descricaoCurta = product.description.substring(0, 255);
  }

  if (product.cost) {
    blingProduct.precoCusto = Number(product.cost);
  }

  if (product.stock !== undefined && product.stock !== null) {
    blingProduct.estoque = {
      minimo: 0,
      maximo: 0,
      crossdocking: 0,
      localizacao: '',
    };
  }

  if (product.barcode) {
    blingProduct.gtin = product.barcode;
  }

  if (product.weight_kg) {
    blingProduct.pesoBruto = Number(product.weight_kg);
    blingProduct.pesoLiquido = Number(product.weight_kg);
  }

  console.log('[bling-sync-products] Sending product to Bling:', JSON.stringify(blingProduct, null, 2));

  const response = await fetch(`${BLING_API_URL}/produtos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(blingProduct),
  });

  const responseText = await response.text();
  console.log('[bling-sync-products] Bling API response status:', response.status);
  console.log('[bling-sync-products] Bling API response:', responseText);

  let blingProductId: number;
  let kind: 'created' | 'already_exists';

  if (!response.ok) {
    if (responseText.includes('insufficient_scope')) {
      throw new Error(
        'Token do Bling sem permissão para PRODUTOS. No Bling, adicione os escopos de Produtos (leitura/escrita) ao seu aplicativo e autorize novamente.'
      );
    }

    // Check if product already exists by code
    if (response.status === 400 && isDuplicateCodigoError(responseText)) {
      const existingId = await findExistingBlingProductByCodigo(accessToken, blingProduct.codigo);
      if (existingId) {
        blingProductId = existingId;
        kind = 'already_exists';
      } else {
        throw new Error(`Bling API error: ${response.status} - ${responseText}`);
      }
    } else {
      throw new Error(`Bling API error: ${response.status} - ${responseText}`);
    }
  } else {
    const parsed = JSON.parse(responseText);
    const createdId = parsed?.data?.id ?? parsed?.id;
    const numericId = typeof createdId === 'number' 
      ? createdId 
      : (typeof createdId === 'string' && /^\d+$/.test(createdId) ? Number(createdId) : null);

    if (!numericId) {
      throw new Error('Produto criado no Bling, mas não foi possível obter o ID na resposta.');
    }
    
    blingProductId = numericId;
    kind = 'created';
  }

  // Link product to store if configured
  let linkedToStore = false;
  if (blingStoreId) {
    await delay(350); // Rate limiting
    linkedToStore = await linkProductToStore(
      blingProductId, 
      blingStoreId, 
      accessToken,
      blingProduct.codigo,
      blingProduct.preco
    );
  }

  return { kind, blingProductId, linkedToStore, raw: { responseText } };
}

/**
 * Fetch products from Bling (for reference/future use)
 */
async function fetchProductsFromBling(accessToken: string, page = 1, limit = 100): Promise<any> {
  const response = await fetch(
    `${BLING_API_URL}/produtos?pagina=${page}&limite=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bling API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, tenant_id, product_id } = await req.json();

    console.log(`[bling-sync-products] Action: ${action}, Tenant: ${tenant_id}, Product: ${product_id}`);

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get integration settings
    const { data: integration, error: integrationError } = await supabase
      .from('integration_bling')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    if (integrationError || !integration) {
      console.error('[bling-sync-products] Integration not found:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Bling integration not configured' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.is_active) {
      return new Response(
        JSON.stringify({ error: 'Bling integration is not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.sync_products) {
      return new Response(
        JSON.stringify({ error: 'Product sync is not enabled for this tenant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, integration);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Failed to get valid access token. Please reconnect Bling.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;

    switch (action) {
      case 'send_product': {
        if (!product_id) {
          return new Response(
            JSON.stringify({ error: 'product_id is required for send_product action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: product, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', product_id)
          .eq('tenant_id', tenant_id)
          .single();

        if (productError || !product) {
          console.error('[bling-sync-products] Product not found:', productError);
          return new Response(
            JSON.stringify({ error: 'Product not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if already synced
        if (product.bling_product_id) {
          result = {
            skipped: true,
            reason: 'product_already_synced',
            bling_product_id: product.bling_product_id,
          };
          break;
        }

        const sendResult = await sendProductToBling(product, accessToken, integration.bling_store_id);

        // Update product with Bling ID
        await supabase
          .from('products')
          .update({ 
            bling_product_id: sendResult.blingProductId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', product_id);

        result = {
          success: true,
          kind: sendResult.kind,
          bling_product_id: sendResult.blingProductId,
          linked_to_store: sendResult.linkedToStore,
          product_name: product.name,
        };
        break;
      }

      case 'sync_all': {
        // Get all active products without bling_product_id
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('is_active', true)
          .is('bling_product_id', null)
          .order('created_at', { ascending: true })
          .limit(100); // Process in batches of 100

        if (productsError) {
          console.error('[bling-sync-products] Error fetching products:', productsError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch products' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!products || products.length === 0) {
          result = {
            success: true,
            message: 'No products pending sync',
            synced: 0,
            errors: 0,
          };
          break;
        }

        console.log(`[bling-sync-products] Syncing ${products.length} products...`);

        const results: any[] = [];
        let synced = 0;
        let errors = 0;

        for (const product of products) {
          try {
            await delay(350); // Rate limiting: 3 req/sec

            const sendResult = await sendProductToBling(product, accessToken, integration.bling_store_id);

            // Update product with Bling ID
            await supabase
              .from('products')
              .update({ 
                bling_product_id: sendResult.blingProductId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', product.id);

            results.push({
              product_id: product.id,
              product_name: product.name,
              success: true,
              kind: sendResult.kind,
              bling_product_id: sendResult.blingProductId,
              linked_to_store: sendResult.linkedToStore,
            });
            synced++;
          } catch (error: any) {
            console.error(`[bling-sync-products] Error syncing product ${product.id}:`, error);
            results.push({
              product_id: product.id,
              product_name: product.name,
              success: false,
              error: error.message,
            });
            errors++;
          }
        }

        // Update last sync timestamp
        await supabase
          .from('integration_bling')
          .update({ 
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenant_id);

        result = {
          success: true,
          message: `Synced ${synced} products, ${errors} errors`,
          synced,
          errors,
          total: products.length,
          details: results,
        };
        break;
      }

      case 'fetch_products': {
        const blingProducts = await fetchProductsFromBling(accessToken);
        result = {
          success: true,
          products: blingProducts?.data || [],
        };
        break;
      }

      case 'count_pending': {
        // Count products pending sync
        const { count: pending, error: countError1 } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant_id)
          .eq('is_active', true)
          .is('bling_product_id', null);

        const { count: synced, error: countError2 } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant_id)
          .not('bling_product_id', 'is', null);

        if (countError1 || countError2) {
          console.error('[bling-sync-products] Error counting products:', countError1 || countError2);
        }

        result = {
          success: true,
          pending: pending || 0,
          synced: synced || 0,
          total: (pending || 0) + (synced || 0),
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[bling-sync-products] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
