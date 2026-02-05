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
    const blingHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    // ── Helper: fetch com retry automático para 429 ──
    const fetchWithRetry = async (url: string, options: RequestInit, context: string, maxRetries = 2): Promise<Response> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, options);
        if (res.status === 429) {
          const waitMs = (attempt + 1) * 2000;
          console.warn(`[sync-address-bling] 429 Rate Limit on ${context}. Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        return res;
      }
      // fallback final (sem retry)
      return await fetch(url, options);
    };

    // ── Helper: log detalhado de erros Bling ──
    const logBlingError = async (context: string, response: Response) => {
      const status = response.status;
      const body = await response.text();
      console.error(`[sync-address-bling] BLING API ERROR - ${context}: HTTP ${status}, Body: ${body}`);
      if (status === 401) console.error(`[sync-address-bling] 401 - Token expirado. Reautorize o Bling.`);
      if (status === 404) console.error(`[sync-address-bling] 404 - Recurso não existe no Bling.`);
      return { status, body };
    };

    // ── Montar dados de endereço ──
    const street = customer?.street || order.customer_street || '';
    const number = customer?.number || order.customer_number || 'S/N';
    const complement = customer?.complement || order.customer_complement || '';
    const neighborhood = customer?.neighborhood || order.customer_neighborhood || '';
    const cep = (customer?.cep || order.customer_cep || '').replace(/\D/g, '');
    const city = customer?.city || order.customer_city || '';
    const state = customer?.state || order.customer_state || '';

    if (!street || !cep || !city || !state) {
      console.warn(`[sync-address-bling] Incomplete address for order ${order_id}`);
      return new Response(
        JSON.stringify({ error: 'Endereço incompleto. Preencha rua, CEP, cidade e estado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const addressPayload = {
      endereco: street,
      numero: number || 'S/N',
      complemento: complement || '',
      bairro: neighborhood || '',
      cep,
      municipio: city,
      uf: state,
    };

    console.log(`[sync-address-bling] Address payload:`, JSON.stringify(addressPayload));

    const results = { contact: false, order: false };

    // ════════════════════════════════════════════
    // PASSO 1: Resolver bling_contact_id
    // ════════════════════════════════════════════
    let blingContactId = customer?.bling_contact_id;

    if (!blingContactId && customer?.cpf) {
      console.log(`[sync-address-bling] No bling_contact_id, searching by CPF: ${customer.cpf}`);
      try {
        const cpfClean = customer.cpf.replace(/\D/g, '');
        const searchRes = await fetchWithRetry(
          `${BLING_API_URL}/contatos?pesquisa=${cpfClean}`,
          { method: 'GET', headers: blingHeaders },
          `GET /contatos?pesquisa=${cpfClean}`
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const contatos = searchData?.data;
          if (contatos && contatos.length > 0) {
            blingContactId = contatos[0].id;
            console.log(`[sync-address-bling] Found bling_contact_id ${blingContactId} via CPF`);
            // Salvar no banco
            await supabase.from('customers').update({ bling_contact_id: blingContactId }).eq('id', customer.id);
          } else {
            console.warn(`[sync-address-bling] No Bling contact found for CPF ${cpfClean}`);
          }
        } else {
          await logBlingError(`GET /contatos?pesquisa=CPF`, searchRes);
        }
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[sync-address-bling] Error searching contact by CPF:`, err);
      }
    }

    // Atualizar contato no Bling (se temos o ID)
    if (blingContactId) {
      console.log(`[sync-address-bling] Updating contact ${blingContactId}`);
      const contactRes = await fetchWithRetry(
        `${BLING_API_URL}/contatos/${blingContactId}`,
        {
          method: 'PUT',
          headers: blingHeaders,
          body: JSON.stringify({ endereco: { geral: { ...addressPayload } } }),
        },
        `PUT /contatos/${blingContactId}`
      );

      if (contactRes.status >= 200 && contactRes.status < 300) {
        console.log(`[sync-address-bling] Contact ${blingContactId} updated OK`);
        results.contact = true;
      } else {
        await logBlingError(`PUT /contatos/${blingContactId}`, contactRes);
      }
      await new Promise((r) => setTimeout(r, 500));
    } else {
      console.log(`[sync-address-bling] No bling_contact_id resolved, skipping contact update`);
    }

    // ════════════════════════════════════════════
    // PASSO 2: Resolver bling_order_id
    // ════════════════════════════════════════════
    let blingOrderId = order.bling_order_id;

    if (!blingOrderId) {
      console.log(`[sync-address-bling] No bling_order_id, searching by number OZ-${order_id}`);
      try {
        const searchRes = await fetchWithRetry(
          `${BLING_API_URL}/pedidos/vendas?numero=OZ-${order_id}`,
          { method: 'GET', headers: blingHeaders },
          `GET /pedidos/vendas?numero=OZ-${order_id}`
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const pedidos = searchData?.data;
          if (pedidos && pedidos.length > 0) {
            blingOrderId = pedidos[0].id;
            console.log(`[sync-address-bling] Found bling_order_id ${blingOrderId}`);
            await supabase.from('orders').update({ bling_order_id: blingOrderId }).eq('id', order_id).eq('tenant_id', tenant_id);
          } else {
            console.warn(`[sync-address-bling] No Bling order found for OZ-${order_id}`);
          }
        } else {
          await logBlingError(`GET /pedidos/vendas?numero=OZ-${order_id}`, searchRes);
        }
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[sync-address-bling] Error searching order by number:`, err);
      }
    }

    // ════════════════════════════════════════════
    // PASSO 3: Atualizar pedido no Bling
    // ════════════════════════════════════════════
    if (blingOrderId) {
      console.log(`[sync-address-bling] Updating order ${blingOrderId}`);
      const orderRes = await fetchWithRetry(
        `${BLING_API_URL}/pedidos/vendas/${blingOrderId}`,
        {
          method: 'PUT',
          headers: blingHeaders,
          body: JSON.stringify({ contato: { endereco: { geral: { ...addressPayload } } } }),
        },
        `PUT /pedidos/vendas/${blingOrderId}`
      );

      if (orderRes.status >= 200 && orderRes.status < 300) {
        console.log(`[sync-address-bling] Order ${blingOrderId} updated OK`);
        results.order = true;
      } else {
        await logBlingError(`PUT /pedidos/vendas/${blingOrderId}`, orderRes);
      }
    } else {
      console.warn(`[sync-address-bling] No bling_order_id resolved for order ${order_id}, skipping`);
    }

    // ── Resultado ──
    const allSuccess = (blingContactId ? results.contact : true) && (blingOrderId ? results.order : true);
    const message = allSuccess
      ? 'Endereço atualizado no Bling com sucesso!'
      : `Resultado parcial: Contato=${results.contact ? 'OK' : 'falhou/skip'}, Pedido=${results.order ? 'OK' : 'falhou/skip'}`;

    console.log(`[sync-address-bling] Final: ${message}`);

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
