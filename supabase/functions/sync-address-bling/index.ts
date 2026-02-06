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

    log('▶ INÍCIO — Modo: somente contato');

    // 1. Buscar pedido (para pegar o telefone do cliente)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, tenant_id, customer_phone, customer_name, customer_street, customer_number, customer_complement, customer_neighborhood, customer_cep, customer_city, customer_state')
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

    log('Pedido encontrado', { phone: order.customer_phone });

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
      .select('access_token, is_active')
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

    const blingHeaders = {
      'Authorization': `Bearer ${blingConfig.access_token}`,
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
          log(`⏳ 429 Rate Limit. Aguardando ${waitMs}ms...`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        return res;
      }
      return await fetch(url, options);
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

    log('Endereço montado', addressPayload);

    // ════════════════════════════════════════════
    // Resolver bling_contact_id
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
            if (customer) {
              await supabase.from('customers').update({ bling_contact_id: blingContactId }).eq('id', customer.id);
            }
          } else {
            log('⚠ Nenhum contato encontrado no Bling para este CPF');
          }
        }
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        logErr('Exceção ao buscar contato por CPF', { message: (err as Error).message });
      }
    } else if (!blingContactId) {
      log('⚠ Cliente sem CPF — não é possível buscar contato no Bling');
    }

    // ════════════════════════════════════════════
    // PUT /contatos — Atualizar cadastro do cliente
    // ════════════════════════════════════════════
    if (!blingContactId) {
      log('⏭ Sem bling_contact_id — não foi possível localizar o contato no Bling');
      return new Response(
        JSON.stringify({ success: false, message: 'Contato não encontrado no Bling (sem bling_contact_id e sem CPF para busca).' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contactName = customer?.name || order.customer_name || '';
    const contactBody: Record<string, unknown> = {
      nome: contactName,
      tipo: 'F',
      situacao: 'A',
      endereco: { geral: { ...addressPayload } },
    };
    if (customer?.cpf) {
      contactBody.numeroDocumento = customer.cpf.replace(/\D/g, '');
    }

    log(`📤 PUT /contatos/${blingContactId}`, contactBody);

    const contactRes = await fetchWithRetry(
      `${BLING_API_URL}/contatos/${blingContactId}`,
      { method: 'PUT', headers: blingHeaders, body: JSON.stringify(contactBody) },
      `PUT /contatos/${blingContactId}`
    );

    if (contactRes.status >= 200 && contactRes.status < 300) {
      log(`✅ Contato ${blingContactId} atualizado com sucesso`);
      return new Response(
        JSON.stringify({ success: true, message: 'Cadastro do cliente atualizado no Bling!', bling_contact_id: blingContactId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Erro no PUT
    const errBody = await contactRes.text();
    logErr(`PUT /contatos/${blingContactId} falhou: HTTP ${contactRes.status}`, { body: errBody.slice(0, 500) });

    return new Response(
      JSON.stringify({ success: false, message: `Erro ao atualizar contato: HTTP ${contactRes.status}`, bling_contact_id: blingContactId }),
      { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-address-bling] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
