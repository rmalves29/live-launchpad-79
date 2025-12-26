import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

interface BlingOrder {
  numero?: number;
  data?: string;
  dataPrevista?: string;
  contato: {
    id?: number;
    nome: string;
    tipoPessoa?: string;
    numeroDocumento?: string;
    telefone?: string;
    email?: string;
    endereco?: {
      endereco?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cep?: string;
      municipio?: string;
      uf?: string;
    };
  };
  itens: Array<{
    codigo?: string;
    descricao: string;
    unidade?: string;
    quantidade: number;
    valor: number;
    aliquotaIPI?: number;
    descricaoDetalhada?: string;
  }>;
  parcelas?: Array<{
    dataVencimento: string;
    valor: number;
    observacoes?: string;
    formaPagamento?: {
      id: number;
    };
  }>;
  transporte?: {
    frete?: number;
    volumes?: Array<{
      servico?: string;
      codigoRastreamento?: string;
    }>;
  };
  observacoes?: string;
  observacoesInternas?: string;
}

async function refreshBlingToken(supabase: any, integration: any): Promise<string | null> {
  if (!integration.refresh_token || !integration.client_id || !integration.client_secret) {
    console.error('[bling-sync-orders] Missing credentials for token refresh');
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
      console.error('[bling-sync-orders] Token refresh failed:', errorText);
      return null;
    }

    const tokenData = await response.json();
    
    // Update tokens in database
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

    console.log('[bling-sync-orders] Token refreshed successfully');
    return tokenData.access_token;
  } catch (error) {
    console.error('[bling-sync-orders] Error refreshing token:', error);
    return null;
  }
}

async function getValidAccessToken(supabase: any, integration: any): Promise<string | null> {
  // Check if token is expired or about to expire (5 min buffer)
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    
    if (expiresAt.getTime() - now.getTime() < bufferMs) {
      console.log('[bling-sync-orders] Token expired or expiring soon, refreshing...');
      return await refreshBlingToken(supabase, integration);
    }
  }
  
  return integration.access_token;
}

async function sendOrderToBling(order: any, cartItems: any[], accessToken: string): Promise<any> {
  // Map order to Bling format
  const blingOrder: BlingOrder = {
    data: new Date(order.created_at).toISOString().split('T')[0],
    dataPrevista: order.event_date,
    contato: {
      nome: order.customer_name || 'Cliente',
      telefone: order.customer_phone,
      endereco: {
        endereco: order.customer_street || '',
        numero: order.customer_number || '',
        complemento: order.customer_complement || '',
        bairro: '', // Not available in current schema
        cep: order.customer_cep || '',
        municipio: order.customer_city || '',
        uf: order.customer_state || '',
      },
    },
    itens: cartItems.map(item => ({
      codigo: item.product_code || '',
      descricao: item.product_name || 'Produto',
      quantidade: item.qty,
      valor: Number(item.unit_price),
    })),
    observacoes: order.observation || '',
    observacoesInternas: `Pedido ID: ${order.id} | Evento: ${order.event_type}`,
  };

  console.log('[bling-sync-orders] Sending order to Bling:', JSON.stringify(blingOrder, null, 2));

  const response = await fetch(`${BLING_API_URL}/pedidos/vendas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(blingOrder),
  });

  const responseText = await response.text();
  console.log('[bling-sync-orders] Bling API response status:', response.status);
  console.log('[bling-sync-orders] Bling API response:', responseText);

  if (!response.ok) {
    throw new Error(`Bling API error: ${response.status} - ${responseText}`);
  }

  return JSON.parse(responseText);
}

async function fetchOrdersFromBling(accessToken: string, page = 1, limit = 100): Promise<any> {
  const response = await fetch(
    `${BLING_API_URL}/pedidos/vendas?pagina=${page}&limite=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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

    const { action, tenant_id, order_id } = await req.json();

    console.log(`[bling-sync-orders] Action: ${action}, Tenant: ${tenant_id}, Order: ${order_id}`);

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Bling integration settings
    const { data: integration, error: integrationError } = await supabase
      .from('integration_bling')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    if (integrationError || !integration) {
      console.error('[bling-sync-orders] Integration not found:', integrationError);
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

    if (!integration.sync_orders) {
      return new Response(
        JSON.stringify({ error: 'Order sync is not enabled for this tenant' }),
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
      case 'send_order': {
        // Send a specific order to Bling
        if (!order_id) {
          return new Response(
            JSON.stringify({ error: 'order_id is required for send_order action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get order details
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', order_id)
          .eq('tenant_id', tenant_id)
          .single();

        if (orderError || !order) {
          console.error('[bling-sync-orders] Order not found:', orderError);
          return new Response(
            JSON.stringify({ error: 'Order not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get cart items
        let cartItems = [];
        if (order.cart_id) {
          const { data: items, error: itemsError } = await supabase
            .from('cart_items')
            .select('*')
            .eq('cart_id', order.cart_id);

          if (!itemsError && items) {
            cartItems = items;
          }
        }

        result = await sendOrderToBling(order, cartItems, accessToken);
        
        // Update last sync timestamp
        await supabase
          .from('integration_bling')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id);

        break;
      }

      case 'fetch_orders': {
        // Fetch orders from Bling
        result = await fetchOrdersFromBling(accessToken);
        break;
      }

      case 'sync_all': {
        // Sync all pending orders to Bling
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('is_paid', true)
          .order('created_at', { ascending: false })
          .limit(50);

        if (ordersError) {
          throw new Error(`Failed to fetch orders: ${ordersError.message}`);
        }

        const results = [];
        for (const order of orders || []) {
          try {
            let cartItems = [];
            if (order.cart_id) {
              const { data: items } = await supabase
                .from('cart_items')
                .select('*')
                .eq('cart_id', order.cart_id);
              cartItems = items || [];
            }

            const blingResult = await sendOrderToBling(order, cartItems, accessToken);
            results.push({ order_id: order.id, success: true, bling_response: blingResult });
          } catch (error) {
            console.error(`[bling-sync-orders] Error syncing order ${order.id}:`, error);
            results.push({ order_id: order.id, success: false, error: error.message });
          }
        }

        // Update last sync timestamp
        await supabase
          .from('integration_bling')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id);

        result = { synced: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, details: results };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log('[bling-sync-orders] Success:', JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bling-sync-orders] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
