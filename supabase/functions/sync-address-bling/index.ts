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

    const log = (msg: string, data?: unknown) => {
      console.log(`[sync-address-bling] [order=${order_id}] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
    };

    log('▶ INÍCIO — Modo: somente contato');

    // 1. Buscar pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, tenant_id, customer_phone, customer_name, customer_street, customer_number, customer_complement, customer_neighborhood, customer_cep, customer_city, customer_state')
      .eq('id', order_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Pedido não encontrado', detail: orderError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Buscar cliente
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, cpf, phone, street, number, complement, neighborhood, cep, city, state, bling_contact_id')
      .eq('phone', order.customer_phone)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // 3. Buscar token Bling
    const { data: blingConfig } = await supabase
      .from('integration_bling')
      .select('access_token')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!blingConfig?.access_token) {
      return new Response(
        JSON.stringify({ error: 'Integração Bling não configurada ou inativa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const blingHeaders = {
      'Authorization': `Bearer ${blingConfig.access_token}`,
      'Content-Type': 'application/json',
    };

    // Montar endereço
    const street = customer?.street || order.customer_street || '';
    const number = customer?.number || order.customer_number || 'S/N';
    const complement = customer?.complement || order.customer_complement || '';
    const neighborhood = customer?.neighborhood || order.customer_neighborhood || '';
    const cep = (customer?.cep || order.customer_cep || '').replace(/\D/g, '');
    const city = customer?.city || order.customer_city || '';
    const state = customer?.state || order.customer_state || '';

    if (!street || !cep || !city || !state) {
      return new Response(
        JSON.stringify({ error: 'Endereço incompleto. Preencha rua, CEP, cidade e estado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolver bling_contact_id
    let blingContactId = customer?.bling_contact_id;

    if (!blingContactId && customer?.cpf) {
      const cpfClean = customer.cpf.replace(/\D/g, '');
      log(`Buscando contato por CPF: ${cpfClean}`);
      try {
        const searchRes = await fetch(`${BLING_API_URL}/contatos?pesquisa=${cpfClean}`, {
          method: 'GET',
          headers: blingHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const contatos = searchData?.data;
          if (contatos?.length > 0) {
            blingContactId = contatos[0].id;
            log(`Contato encontrado: ${blingContactId}`);
            if (customer) {
              await supabase.from('customers').update({ bling_contact_id: blingContactId }).eq('id', customer.id);
            }
          }
        } else {
          await searchRes.text(); // consume body
        }
      } catch (err) {
        log(`Erro ao buscar contato por CPF: ${(err as Error).message}`);
      }
    }

    if (!blingContactId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Contato não encontrado no Bling (sem bling_contact_id e sem CPF para busca).' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PUT /contatos/{id} — Apenas atualizar cadastro do cliente
    const contactBody = {
      nome: customer?.name || order.customer_name || '',
      tipo: 'F',
      situacao: 'A',
      ...(customer?.cpf ? { numeroDocumento: customer.cpf.replace(/\D/g, '') } : {}),
      endereco: {
        geral: {
          endereco: street,
          numero: number || 'S/N',
          complemento: complement || '',
          bairro: neighborhood || '',
          cep,
          municipio: city,
          uf: state,
        },
      },
    };

    log(`PUT /contatos/${blingContactId}`);

    const contactRes = await fetch(`${BLING_API_URL}/contatos/${blingContactId}`, {
      method: 'PUT',
      headers: blingHeaders,
      body: JSON.stringify(contactBody),
      signal: AbortSignal.timeout(10000),
    });

    const resBody = await contactRes.text();

    if (contactRes.status >= 200 && contactRes.status < 300) {
      log(`✅ Contato ${blingContactId} atualizado`);
      return new Response(
        JSON.stringify({ success: true, message: 'Cadastro do cliente atualizado no Bling!', bling_contact_id: blingContactId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log(`❌ PUT falhou: HTTP ${contactRes.status} — ${resBody.slice(0, 300)}`);
    return new Response(
      JSON.stringify({ success: false, message: `Erro ao atualizar contato: HTTP ${contactRes.status}`, bling_contact_id: blingContactId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-address-bling] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
