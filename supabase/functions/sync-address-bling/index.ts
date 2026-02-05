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
      return new Response(
        JSON.stringify({ error: 'Endereço incompleto no banco de dados. Preencha rua, CEP, cidade e estado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const addressPayload = {
      endereco: street,
      numero: number,
      complemento: complement,
      bairro: neighborhood,
      cep: cep,
      municipio: city,
      uf: state,
    };

    console.log(`[sync-address-bling] Address payload:`, JSON.stringify(addressPayload));

    const results = { contact: false, order: false };

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

      const contactStatus = contactRes.status;
      const contactData = await contactRes.text();
      console.log(`[sync-address-bling] Contact update status: ${contactStatus}, response: ${contactData}`);

      if (contactStatus >= 200 && contactStatus < 300) {
        results.contact = true;
      } else {
        console.error(`[sync-address-bling] Failed to update contact: ${contactData}`);
      }
    } else {
      console.log(`[sync-address-bling] No bling_contact_id found, skipping contact update`);
    }

    // PASSO 2: Atualizar pedido no Bling
    const blingOrderId = order.bling_order_id;
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

      const orderStatus = orderRes.status;
      const orderData = await orderRes.text();
      console.log(`[sync-address-bling] Order update status: ${orderStatus}, response: ${orderData}`);

      if (orderStatus >= 200 && orderStatus < 300) {
        results.order = true;
      } else {
        console.error(`[sync-address-bling] Failed to update order: ${orderData}`);
      }
    } else {
      console.log(`[sync-address-bling] No bling_order_id found, skipping order update`);
    }

    // Resultado
    const allSuccess = (blingContactId ? results.contact : true) && (blingOrderId ? results.order : true);
    const message = allSuccess
      ? 'Endereço atualizado no Bling com sucesso!'
      : `Resultado parcial: Contato=${results.contact ? 'OK' : 'falhou'}, Pedido=${results.order ? 'OK' : 'falhou'}`;

    return new Response(
      JSON.stringify({
        success: allSuccess,
        message,
        results,
        had_contact_id: !!blingContactId,
        had_order_id: !!blingOrderId,
      }),
      {
        status: allSuccess ? 200 : 207,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[sync-address-bling] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
