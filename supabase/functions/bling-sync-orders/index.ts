import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

// Helper to delay between requests (Bling limit: 3 req/second)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isDuplicateNumeroError(payloadText: string): boolean {
  // Bling validation error: code 36 -> duplicate "numero" for sales order
  return (
    payloadText.includes('"code":36') &&
    payloadText.includes('"element":"numero"') &&
    payloadText.includes('VENDAS')
  );
}

async function findExistingBlingSaleOrderIdByNumero(accessToken: string, numero: number | string): Promise<number | null> {
  const res = await fetch(`${BLING_API_URL}/pedidos/vendas?pagina=1&limite=1&numero=${encodeURIComponent(String(numero))}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  const text = await res.text();
  if (!res.ok) {
    console.log('[bling-sync-orders] Could not search existing order in Bling:', res.status, text);
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    const first = parsed?.data?.[0] || parsed?.data?.pedidos?.[0] || parsed?.[0];
    const id = first?.id;
    if (typeof id === 'number') return id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
    return null;
  } catch {
    return null;
  }
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
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000;

    if (expiresAt.getTime() - now.getTime() < bufferMs) {
      console.log('[bling-sync-orders] Token expired or expiring soon, refreshing...');
      return await refreshBlingToken(supabase, integration);
    }
  }

  return integration.access_token;
}

async function getOrCreateBlingContactId(order: any, customer: any, accessToken: string): Promise<number> {
  const phone = (order.customer_phone || '').replace(/\D/g, '');
  
  // Priorizar dados do customer, fallback para dados do order
  const customerName = customer?.name || order.customer_name || 'Cliente';
  const customerCpf = (customer?.cpf || '').replace(/\D/g, '');
  const customerCep = (customer?.cep || order.customer_cep || '').replace(/\D/g, '');
  const customerStreet = customer?.street || order.customer_street || '';
  const customerNumber = customer?.number || order.customer_number || 'S/N';
  const customerComplement = customer?.complement || order.customer_complement || '';
  const customerNeighborhood = customer?.neighborhood || '';
  const customerCity = customer?.city || order.customer_city || '';
  const customerState = customer?.state || order.customer_state || '';
  const customerEmail = customer?.email || '';

  // 1) Try to find an existing contact (best-effort; API may vary by account)
  try {
    const searchRes = await fetch(
      `${BLING_API_URL}/contatos?pagina=1&limite=1&pesquisa=${encodeURIComponent(phone || customerName)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    const searchText = await searchRes.text();
    if (searchRes.ok) {
      const parsed = JSON.parse(searchText);
      const first = parsed?.data?.[0] || parsed?.data?.contatos?.[0] || parsed?.[0];
      const id = first?.id;
      if (typeof id === 'number') return id;
      if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
    } else {
      // If scope is missing, Bling returns 403 with insufficient_scope
      if (searchText.includes('insufficient_scope')) {
        throw new Error(
          'Token do Bling sem permissão para CONTATOS. No Bling, adicione os escopos de Contatos (leitura/escrita) ao seu aplicativo e autorize novamente.'
        );
      }
    }
  } catch (e) {
    // Ignore parse/search errors and try to create the contact below.
    console.log('[bling-sync-orders] Contact search failed (will try create):', String(e?.message || e));
  }

  // 2) Create the contact with full data
  const payload: any = {
    nome: customerName,
    tipo: 'F', // Pessoa Física
    situacao: 'A', // Ativo
    telefone: phone || undefined,
    celular: phone || undefined,
    email: customerEmail || undefined,
    endereco: {
      endereco: customerStreet,
      numero: customerNumber,
      complemento: customerComplement,
      bairro: customerNeighborhood,
      cep: customerCep,
      municipio: customerCity,
      uf: customerState,
    },
  };

  // Adicionar CPF/CNPJ se disponível
  if (customerCpf) {
    payload.numeroDocumento = customerCpf;
  }

  console.log('[bling-sync-orders] Creating contact with payload:', JSON.stringify(payload, null, 2));

  const createRes = await fetch(`${BLING_API_URL}/contatos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const createText = await createRes.text();
  console.log('[bling-sync-orders] Bling create contact status:', createRes.status);
  console.log('[bling-sync-orders] Bling create contact response:', createText);

  if (!createRes.ok) {
    if (createText.includes('insufficient_scope')) {
      throw new Error(
        'Token do Bling sem permissão para criar CONTATOS. No Bling, adicione os escopos de Contatos (leitura/escrita) ao seu aplicativo e autorize novamente.'
      );
    }
    throw new Error(`Bling API error creating contact: ${createRes.status} - ${createText}`);
  }

  const created = JSON.parse(createText);
  const id = created?.data?.id ?? created?.id;
  if (typeof id === 'number') return id;
  if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);

  throw new Error('Contato criado no Bling, mas não foi possível obter o ID do contato na resposta.');
}

type SendOrderResult =
  | { kind: 'created'; blingOrderId: number; raw: any }
  | { kind: 'already_exists'; blingOrderId: number; raw: any };

async function sendOrderToBling(order: any, cartItems: any[], customer: any, accessToken: string, storeId?: number): Promise<SendOrderResult> {
  if (!cartItems || cartItems.length === 0) {
    throw new Error('O pedido não possui itens para enviar ao Bling');
  }

  const contactId = await getOrCreateBlingContactId(order, customer, accessToken);

  // Priorizar dados do customer, fallback para dados do order
  const customerCep = (customer?.cep || order.customer_cep || '').replace(/\D/g, '');
  const customerStreet = customer?.street || order.customer_street || '';
  const customerNumber = customer?.number || order.customer_number || 'S/N';
  const customerComplement = customer?.complement || order.customer_complement || '';
  const customerNeighborhood = customer?.neighborhood || '';
  const customerCity = customer?.city || order.customer_city || '';
  const customerState = customer?.state || order.customer_state || '';
  const customerName = customer?.name || order.customer_name || 'Cliente';

  // Bling v3: situacao do pedido (0=Em aberto, 6=Em andamento, 9=Atendido, 12=Cancelado)
  // numeroLoja é o número visível para busca no painel
  // loja vincula o pedido a um canal de venda específico
  const blingOrder: any = {
    numero: order.id,
    numeroLoja: String(order.id),
    data: new Date(order.created_at).toISOString().split('T')[0],
    dataPrevista: order.event_date,
    situacao: { id: 6 }, // 6 = Em andamento (aparece na listagem padrão)
    contato: { id: contactId },
    itens: cartItems.map((item) => ({
      codigo: item.product_code || `PROD-${item.id}`,
      descricao: item.product_name || 'Produto',
      quantidade: item.qty || 1,
      valor: Number(item.unit_price) || 0,
      unidade: 'UN',
    })),
    observacoes: order.observation || '',
    observacoesInternas: `Pedido ID: ${order.id} | Evento: ${order.event_type}`,
  };

  // Adicionar dados de transporte/entrega se tiver endereço
  if (customerCep && customerStreet) {
    blingOrder.transporte = {
      contato: {
        nome: customerName,
        endereco: customerStreet,
        numero: customerNumber,
        complemento: customerComplement,
        bairro: customerNeighborhood,
        cep: customerCep,
        municipio: customerCity,
        uf: customerState,
      },
    };
    console.log('[bling-sync-orders] Adicionando dados de transporte ao pedido');
  }

  // Vincular à loja OrderZap se configurado
  if (storeId) {
    blingOrder.loja = { id: storeId };
    console.log(`[bling-sync-orders] Vinculando pedido à loja ID: ${storeId}`);
  }

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
    if (responseText.includes('insufficient_scope')) {
      throw new Error(
        'Token do Bling sem permissão para VENDAS/PEDIDOS. No Bling, adicione os escopos de Vendas/Pedidos (leitura/escrita) ao seu aplicativo e autorize novamente.'
      );
    }

    // Se já existir no Bling, buscamos o ID e marcamos como sincronizado no nosso lado.
    if (response.status === 400 && isDuplicateNumeroError(responseText)) {
      const existingId = await findExistingBlingSaleOrderIdByNumero(accessToken, order.id);
      if (existingId) {
        return { kind: 'already_exists', blingOrderId: existingId, raw: { error: responseText } };
      }
    }

    throw new Error(`Bling API error: ${response.status} - ${responseText}`);
  }

  const parsed = JSON.parse(responseText);
  const createdId = parsed?.data?.id ?? parsed?.id;
  const numericId = typeof createdId === 'number' ? createdId : (typeof createdId === 'string' && /^\d+$/.test(createdId) ? Number(createdId) : null);

  if (!numericId) {
    throw new Error('Pedido criado no Bling, mas não foi possível obter o ID na resposta.');
  }

  return { kind: 'created', blingOrderId: numericId, raw: parsed };
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
        if (!order_id) {
          return new Response(
            JSON.stringify({ error: 'order_id is required for send_order action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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

        // Se já temos o ID do Bling salvo, consideramos sincronizado.
        if (order.bling_order_id) {
          result = {
            skipped: true,
            reason: 'order_already_synced',
            order_id: order.id,
            bling_order_id: order.bling_order_id,
          };
          break;
        }

        let cartItems: any[] = [];
        if (order.cart_id) {
          const { data: items, error: itemsError } = await supabase
            .from('cart_items')
            .select('*')
            .eq('cart_id', order.cart_id);

          if (!itemsError && items) {
            cartItems = items;
          }
        }

        // Buscar dados do cliente pelo telefone
        const normalizedPhone = (order.customer_phone || '').replace(/\D/g, '');
        let customer = null;
        if (normalizedPhone) {
          const { data: customerData } = await supabase
            .from('customers')
            .select('*')
            .eq('tenant_id', tenant_id)
            .or(`phone.eq.${normalizedPhone},phone.like.%${normalizedPhone.slice(-9)}%`)
            .limit(1)
            .single();
          customer = customerData;
        }

        console.log('[bling-sync-orders] Customer found:', customer ? customer.name : 'NOT FOUND');

        // Usar loja configurada no banco (se houver)
        const blingStoreId = integration.bling_store_id || null;
        const blingResult = await sendOrderToBling(order, cartItems, customer, accessToken, blingStoreId);

        // Persistir o ID do pedido no Bling (inclui caso "já existe")
        await supabase
          .from('orders')
          .update({ bling_order_id: blingResult.blingOrderId })
          .eq('id', order.id)
          .eq('tenant_id', tenant_id);

        await supabase
          .from('integration_bling')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id);

        result = {
          order_id: order.id,
          bling_order_id: blingResult.blingOrderId,
          status: blingResult.kind,
        };

        break;
      }

      case 'fetch_orders': {
        result = await fetchOrdersFromBling(accessToken);
        break;
      }

      case 'sync_all': {
        // Buscar pedidos pagos que ainda não foram sincronizados
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('is_paid', true)
          .is('bling_order_id', null)
          .order('created_at', { ascending: false })
          .limit(50);

        if (ordersError) {
          throw new Error(`Failed to fetch orders: ${ordersError.message}`);
        }

        const results: any[] = [];
        for (let i = 0; i < (orders || []).length; i++) {
          const order = orders![i];

          // Add delay between requests to respect Bling rate limit (3 req/sec)
          if (i > 0) {
            await delay(400); // 400ms delay = ~2.5 req/sec (safe margin)
          }

          try {
            let cartItems: any[] = [];
            if (order.cart_id) {
              const { data: items } = await supabase
                .from('cart_items')
                .select('*')
                .eq('cart_id', order.cart_id);
              cartItems = items || [];
            }

            // Skip orders without items
            if (cartItems.length === 0) {
              console.log(`[bling-sync-orders] Skipping order ${order.id}: no items`);
              results.push({ order_id: order.id, success: false, error: 'Pedido sem itens' });
              continue;
            }

            // Buscar dados do cliente pelo telefone
            const normalizedPhone = (order.customer_phone || '').replace(/\D/g, '');
            let customer = null;
            if (normalizedPhone) {
              const { data: customerData } = await supabase
                .from('customers')
                .select('*')
                .eq('tenant_id', tenant_id)
                .or(`phone.eq.${normalizedPhone},phone.like.%${normalizedPhone.slice(-9)}%`)
                .limit(1)
                .single();
              customer = customerData;
            }

            console.log(`[bling-sync-orders] Order ${order.id} - Customer found:`, customer ? customer.name : 'NOT FOUND');

            // Usar loja configurada no banco (se houver)
            const blingStoreId = integration.bling_store_id || null;
            const blingResult = await sendOrderToBling(order, cartItems, customer, accessToken, blingStoreId);

            await supabase
              .from('orders')
              .update({ bling_order_id: blingResult.blingOrderId })
              .eq('id', order.id)
              .eq('tenant_id', tenant_id);

            results.push({
              order_id: order.id,
              success: true,
              bling_order_id: blingResult.blingOrderId,
              status: blingResult.kind,
            });
          } catch (error) {
            console.error(`[bling-sync-orders] Error syncing order ${order.id}:`, error);
            results.push({ order_id: order.id, success: false, error: error.message });
          }
        }

        await supabase
          .from('integration_bling')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id);

        result = {
          synced: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          skipped: results.filter(r => r.error === 'Pedido sem itens').length,
          details: results,
        };
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
