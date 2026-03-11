import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

async function omieCall(appKey: string, appSecret: string, endpoint: string, call: string, params: any) {
  const response = await fetch(`${OMIE_API_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call,
      app_key: appKey,
      app_secret: appSecret,
      param: [params],
    }),
  });
  return await response.json();
}

async function findOrCreateOmieClient(appKey: string, appSecret: string, order: any) {
  // Buscar cliente pelo telefone
  const phone = order.customer_phone?.replace(/\D/g, '') || '';
  
  // Tentar incluir/atualizar cliente
  const clientData: any = {
    razao_social: order.customer_name || `Cliente ${phone}`,
    nome_fantasia: order.customer_name || `Cliente ${phone}`,
    telefone1_numero: phone,
    pessoa_fisica: 'S',
    endereco: order.customer_street || '',
    endereco_numero: order.customer_number || 'S/N',
    complemento: order.customer_complement || '',
    bairro: order.customer_neighborhood || '',
    cidade: order.customer_city || '',
    estado: order.customer_state || '',
    cep: order.customer_cep?.replace(/\D/g, '') || '',
    codigo_cliente_integracao: `orderzap_${order.tenant_id}_${phone}`,
  };

  const result = await omieCall(appKey, appSecret, 'geral/clientes/', 'UpsertCliente', clientData);
  
  if (result.faultstring) {
    console.error('[omie-sync-orders] Erro ao criar cliente:', result.faultstring);
    // Tentar buscar pelo código de integração
    const searchResult = await omieCall(appKey, appSecret, 'geral/clientes/', 'ConsultarCliente', {
      codigo_cliente_integracao: clientData.codigo_cliente_integracao,
    });
    if (searchResult.codigo_cliente_omie) {
      return searchResult.codigo_cliente_omie;
    }
    throw new Error(`Erro ao criar/buscar cliente: ${result.faultstring}`);
  }

  return result.codigo_cliente_omie;
}

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

    // Buscar credenciais Omie
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

    const { app_key, app_secret } = integration;
    if (!app_key || !app_secret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Credenciais Omie não configuradas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar pedidos pagos não sincronizados com Omie
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*, cart_items:cart_items(*, products:product_id(*))')
      .eq('tenant_id', tenant_id)
      .eq('is_paid', true)
      .is('omie_order_id', null)
      .is('is_cancelled', false)
      .order('created_at', { ascending: true })
      .limit(50);

    if (ordersError) {
      throw new Error(`Erro ao buscar pedidos: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: 'Nenhum pedido pendente' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let synced = 0;
    let errors = 0;

    for (const order of orders) {
      try {
        // Marcar como em sincronização
        await supabase
          .from('orders')
          .update({ omie_sync_status: 'syncing' })
          .eq('id', order.id);

        // Criar/buscar cliente no Omie
        const omieClientId = await findOrCreateOmieClient(app_key, app_secret, order);

        // Buscar itens do carrinho
        const { data: cartItems } = await supabase
          .from('cart_items')
          .select('*')
          .eq('cart_id', order.cart_id);

        // Montar itens do pedido
        const det = (cartItems || []).map((item: any, idx: number) => ({
          ide: { codigo_item_integracao: `orderzap_${order.id}_${idx + 1}` },
          inf_adic: { peso_bruto: 0.3, peso_liquido: 0.3 },
          produto: {
            codigo_produto_integracao: `orderzap_prod_${item.product_id || idx + 1}`,
            descricao: item.product_name || `Produto ${idx + 1}`,
            quantidade: item.qty || 1,
            valor_unitario: Number(item.unit_price) || 0,
            tipo_desconto: 'V',
            valor_desconto: 0,
          },
        }));

        // Criar pedido no Omie
        const orderPayload = {
          cabecalho: {
            codigo_pedido_integracao: `orderzap_${order.id}`,
            codigo_cliente: omieClientId,
            data_previsao: new Date().toLocaleDateString('pt-BR'),
            quantidade_itens: det.length,
            etapa: '10', // Pedido de Venda
          },
          det,
          informacoes_adicionais: {
            codigo_categoria: '', // Pode ser configurado depois
            numero_pedido: order.id?.toString(),
          },
        };

        const omieResult = await omieCall(
          app_key,
          app_secret,
          'produtos/pedido/',
          'IncluirPedido',
          orderPayload
        );

        if (omieResult.faultstring) {
          // Se o pedido já existe, marcar como sincronizado
          if (omieResult.faultstring.includes('já cadastrado') || omieResult.faultstring.includes('duplicado')) {
            console.log(`[omie-sync-orders] Pedido #${order.id} já existe no Omie`);
            await supabase
              .from('orders')
              .update({ omie_sync_status: 'synced' })
              .eq('id', order.id);
            synced++;
            continue;
          }
          throw new Error(omieResult.faultstring);
        }

        // Atualizar pedido com ID do Omie
        await supabase
          .from('orders')
          .update({
            omie_order_id: omieResult.codigo_pedido || null,
            omie_sync_status: 'synced',
          })
          .eq('id', order.id);

        synced++;
        console.log(`[omie-sync-orders] Pedido #${order.id} sincronizado -> Omie #${omieResult.codigo_pedido}`);
      } catch (err: any) {
        errors++;
        console.error(`[omie-sync-orders] Erro no pedido #${order.id}:`, err.message);
        await supabase
          .from('orders')
          .update({ omie_sync_status: `error: ${err.message?.substring(0, 200)}` })
          .eq('id', order.id);
      }
    }

    // Atualizar last_sync_at
    await supabase
      .from('integration_omie')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id);

    return new Response(
      JSON.stringify({ success: true, synced, errors, total: orders.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[omie-sync-orders] Erro geral:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
