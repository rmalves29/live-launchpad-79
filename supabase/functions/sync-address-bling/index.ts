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

    const ts = () => new Date().toISOString();
    const log = (msg: string, data?: unknown) => {
      console.log(`[${ts()}] [sync-address-bling] [order=${order_id}] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
    };
    const logErr = (msg: string, data?: unknown) => {
      console.error(`[${ts()}] [sync-address-bling] [order=${order_id}] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
    };

    log('▶ INÍCIO');

    // 1. Buscar pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (orderError || !order) {
      logErr('Pedido não encontrado no banco', orderError);
      return new Response(
        JSON.stringify({ error: 'Pedido não encontrado', detail: orderError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log('Pedido encontrado', { phone: order.customer_phone, bling_order_id: order.bling_order_id });

    // 2. Buscar cliente
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', order.customer_phone)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    log('Cliente', {
      found: !!customer,
      cpf: customer?.cpf || 'N/A',
      bling_contact_id: customer?.bling_contact_id || 'N/A',
    });

    // 3. Buscar integração Bling
    const { data: blingConfig } = await supabase
      .from('integration_bling')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!blingConfig?.access_token) {
      logErr('Integração Bling inativa ou sem token');
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

    // ── Helper: fetch com retry para 429 ──
    const fetchWithRetry = async (url: string, options: RequestInit, context: string, maxRetries = 3): Promise<Response> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        log(`→ ${context} (tentativa ${attempt + 1}/${maxRetries + 1})`);
        const res = await fetch(url, options);
        log(`← ${context}: HTTP ${res.status}`);

        if (res.status === 429) {
          const waitMs = (attempt + 1) * 2500;
          log(`⏳ 429 Rate Limit em ${context}. Aguardando ${waitMs}ms...`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        return res;
      }
      log(`⚠ ${context}: todas as tentativas falharam, última chamada...`);
      return await fetch(url, options);
    };

    // ── Helper: log detalhado de erros Bling ──
    const logBlingError = async (context: string, response: Response) => {
      const body = await response.text();
      logErr(`BLING API ERROR - ${context}: HTTP ${response.status}`, { body: body.slice(0, 500) });
      if (response.status === 401) logErr('⛔ Token expirado — reautorize o Bling');
      if (response.status === 404) logErr('⛔ Recurso não existe no Bling');
      return { status: response.status, body };
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
      logErr('Endereço incompleto', { street: !!street, cep: !!cep, city: !!city, state: !!state });
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

    log('Payload de endereço montado', addressPayload);

    const results = { contact: false, order: false };

    // ════════════════════════════════════════════
    // PASSO 1: Resolver bling_contact_id
    // ════════════════════════════════════════════
    let blingContactId = customer?.bling_contact_id;

    if (!blingContactId && customer?.cpf) {
      const cpfClean = customer.cpf.replace(/\D/g, '');
      log(`🔍 Buscando contato no Bling por CPF: ${cpfClean}`);
      try {
        const searchRes = await fetchWithRetry(
          `${BLING_API_URL}/contatos?pesquisa=${cpfClean}`,
          { method: 'GET', headers: blingHeaders },
          `GET /contatos?cpf=${cpfClean}`
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const contatos = searchData?.data;
          if (contatos && contatos.length > 0) {
            blingContactId = contatos[0].id;
            log(`✅ Contato encontrado no Bling: ${blingContactId}`);
            await supabase.from('customers').update({ bling_contact_id: blingContactId }).eq('id', customer.id);
          } else {
            log('⚠ Nenhum contato encontrado no Bling para este CPF');
          }
        } else {
          await logBlingError('Busca contato por CPF', searchRes);
        }
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        logErr('Exceção ao buscar contato por CPF', { message: (err as Error).message });
      }
    } else if (!blingContactId) {
      log('⚠ Cliente sem CPF cadastrado — não é possível buscar contato no Bling');
    }

    // Atualizar contato no Bling
    if (blingContactId) {
      log(`📤 Atualizando contato ${blingContactId} no Bling`);
      try {
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
          log(`✅ Contato ${blingContactId} atualizado com sucesso`);
          results.contact = true;
        } else {
          await logBlingError(`PUT /contatos/${blingContactId}`, contactRes);
        }
      } catch (err) {
        logErr('Exceção ao atualizar contato', { message: (err as Error).message });
      }
      await new Promise((r) => setTimeout(r, 500));
    } else {
      log('⏭ Sem bling_contact_id — pulando atualização de contato');
    }

    // ════════════════════════════════════════════
    // PASSO 2: Resolver bling_order_id
    // ════════════════════════════════════════════
    let blingOrderId = order.bling_order_id;

    if (!blingOrderId) {
      const searchNum = `OZ-${order_id}`;
      log(`🔍 Buscando pedido no Bling por número: ${searchNum}`);
      try {
        const searchRes = await fetchWithRetry(
          `${BLING_API_URL}/pedidos/vendas?numero=${searchNum}`,
          { method: 'GET', headers: blingHeaders },
          `GET /pedidos/vendas?numero=${searchNum}`
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const pedidos = searchData?.data;
          if (pedidos && pedidos.length > 0) {
            blingOrderId = pedidos[0].id;
            log(`✅ Pedido encontrado no Bling: ${blingOrderId}`);
            await supabase.from('orders').update({ bling_order_id: blingOrderId }).eq('id', order_id).eq('tenant_id', tenant_id);
          } else {
            log('⚠ Nenhum pedido encontrado no Bling para este número');
          }
        } else {
          await logBlingError(`Busca pedido por número ${searchNum}`, searchRes);
        }
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        logErr('Exceção ao buscar pedido por número', { message: (err as Error).message });
      }
    }

    // ════════════════════════════════════════════
    // PASSO 3: Atualizar pedido no Bling
    // ════════════════════════════════════════════
    if (blingOrderId) {
      log(`📤 Atualizando pedido ${blingOrderId} no Bling`);
      try {
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
          log(`✅ Pedido ${blingOrderId} atualizado com sucesso`);
          results.order = true;
        } else {
          await logBlingError(`PUT /pedidos/vendas/${blingOrderId}`, orderRes);
        }
      } catch (err) {
        logErr('Exceção ao atualizar pedido', { message: (err as Error).message });
      }
    } else {
      log('⏭ Sem bling_order_id — pedido não encontrado no Bling, pulando atualização');
    }

    // ── Resultado ──
    const allSuccess = (blingContactId ? results.contact : true) && (blingOrderId ? results.order : true);
    const message = allSuccess
      ? 'Endereço atualizado no Bling com sucesso!'
      : `Resultado parcial: Contato=${results.contact ? 'OK' : 'falhou/skip'}, Pedido=${results.order ? 'OK' : 'falhou/skip'}`;

    log(`◀ FIM: ${message}`, results);

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
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
