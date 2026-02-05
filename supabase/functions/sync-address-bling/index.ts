import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { order_id, tenant_id } = await req.json();

    if (!order_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'order_id e tenant_id são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-address-bling] Starting for order ${order_id}, tenant ${tenant_id}`);

    // 1. Buscar pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (orderError || !order) {
      console.error(`[sync-address-bling] Order not found: ${order_id}`, orderError);
      return new Response(
        JSON.stringify({ error: 'Pedido não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Buscar cliente
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', order.customer_phone)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // 3. Buscar integração Bling
    const { data: blingConfig } = await supabase
      .from('integration_bling')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!blingConfig?.access_token) {
      console.error(`[sync-address-bling] No active Bling integration for tenant ${tenant_id}`);
      return new Response(
        JSON.stringify({ error: 'Integração Bling não configurada ou inativa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = blingConfig.access_token;

    // Montar dados de endereço (prioriza customer, fallback para order)
    const street = customer?.street || order.customer_street || '';
    const number = customer?.number || order.customer_number || 'S/N';
    const complement = customer?.complement || order.customer_complement || '';
    const neighborhood = customer?.neighborhood || order.customer_neighborhood || '';
    const cep = (customer?.cep || order.customer_cep || '').replace(/\D/g, '');
    const city = customer?.city || order.customer_city || '';
    const state = customer?.state || order.customer_state || '';

    if (!street || !cep || !city || !state) {
      console.warn(`[sync-address-bling] Incomplete address for order ${order_id}: street=${street}, cep=${cep}, city=${city}, state=${state}`);
      return new Response(
        JSON.stringify({ error: 'Endereço incompleto no banco de dados. Preencha rua, CEP, cidade e estado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Garantir 'S/N' para numero vazio
    const addressPayload = {
      endereco: street,
      numero: number || 'S/N',
      complemento: complement || '',
      bairro: neighborhood || '',
      cep: cep,
      municipio: city,
      uf: state,
    };

    console.log(`[sync-address-bling] Address payload:`, JSON.stringify(addressPayload));

    const results = { contact: false, order: false };

    // Helper para logar erros da API Bling com detalhes
    const logBlingError = async (context: string, response: Response) => {
      const status = response.status;
      const body = await response.text();
      console.error(`[sync-address-bling] BLING API ERROR - ${context}: HTTP ${status}, Body: ${body}`);
      
      if (status === 401) {
        console.error(`[sync-address-bling] 401 Unauthorized - Token expirado ou inválido. Reautorize o Bling.`);
      } else if (status === 404) {
        console.error(`[sync-address-bling] 404 Not Found - Recurso não existe no Bling.`);
      } else if (status === 429) {
        console.error(`[sync-address-bling] 429 Too Many Requests - Rate limit atingido.`);
      }
      
      return { status, body };
    };

    // PASSO 1: Atualizar contato no Bling
    const blingContactId = customer?.bling_contact_id;
    if (blingContactId) {
      console.log(`[sync-address-bling] Updating contact ${blingContactId}`);
      const contactBody = {
        endereco: {
          geral: {
            ...addressPayload,
          },
        },
      };

      const contactRes = await fetch(`${BLING_API_URL}/contatos/${blingContactId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactBody),
      });

      if (contactRes.status >= 200 && contactRes.status < 300) {
        const responseText = await contactRes.text();
        console.log(`[sync-address-bling] Contact ${blingContactId} updated OK: ${responseText}`);
        results.contact = true;
      } else {
        await logBlingError(`PUT /contatos/${blingContactId}`, contactRes);
      }

      // Rate limit: aguardar 500ms entre chamadas
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else {
      console.log(`[sync-address-bling] No bling_contact_id found, skipping contact update`);
    }

    // PASSO 2: Resolver bling_order_id (buscar pelo número se necessário)
    let blingOrderId = order.bling_order_id;

    if (!blingOrderId) {
      console.log(`[sync-address-bling] No bling_order_id for order ${order_id}, searching by number OZ-${order_id}`);
      
      try {
        const searchRes = await fetch(`${BLING_API_URL}/pedidos/vendas?numero=OZ-${order_id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const pedidos = searchData?.data;
          
          if (pedidos && pedidos.length > 0) {
            blingOrderId = pedidos[0].id;
            console.log(`[sync-address-bling] Found bling_order_id ${blingOrderId} for order OZ-${order_id}`);
            
            // Salvar o ID encontrado no banco para futuras consultas
            await supabase
              .from('orders')
              .update({ bling_order_id: blingOrderId })
              .eq('id', order_id)
              .eq('tenant_id', tenant_id);
            
            console.log(`[sync-address-bling] Saved bling_order_id ${blingOrderId} to database`);
          } else {
            console.warn(`[sync-address-bling] No Bling order found for number OZ-${order_id}`);
          }
        } else {
          await logBlingError(`GET /pedidos/vendas?numero=OZ-${order_id}`, searchRes);
        }

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (searchErr) {
        console.error(`[sync-address-bling] Error searching order by number:`, searchErr);
      }
    }

    // PASSO 3: Atualizar pedido no Bling
    if (blingOrderId) {
      console.log(`[sync-address-bling] Updating order ${blingOrderId}`);
      const orderBody = {
        contato: {
          endereco: {
            geral: {
              ...addressPayload,
            },
          },
        },
      };

      const orderRes = await fetch(`${BLING_API_URL}/pedidos/vendas/${blingOrderId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderBody),
      });

      if (orderRes.status >= 200 && orderRes.status < 300) {
        const responseText = await orderRes.text();
        console.log(`[sync-address-bling] Order ${blingOrderId} updated OK: ${responseText}`);
        results.order = true;
      } else {
        await logBlingError(`PUT /pedidos/vendas/${blingOrderId}`, orderRes);
      }
    } else {
      console.warn(`[sync-address-bling] No bling_order_id available for order ${order_id}, skipping order update`);
    }

    // Resultado
    const allSuccess = (blingContactId ? results.contact : true) && (blingOrderId ? results.order : true);
    const message = allSuccess
      ? 'Endereço atualizado no Bling com sucesso!'
      : `Resultado parcial: Contato=${results.contact ? 'OK' : 'falhou/skip'}, Pedido=${results.order ? 'OK' : 'falhou/skip'}`;

    console.log(`[sync-address-bling] Final result for order ${order_id}: ${message}`);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        message,
        results,
        had_contact_id: !!blingContactId,
        had_order_id: !!blingOrderId,
        resolved_order_id: blingOrderId,
      }),
      {
        status: allSuccess ? 200 : 207,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[sync-address-bling] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
