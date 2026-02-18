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

    log('▶ INÍCIO — Sincronização de endereço (endereço do pedido prevalece)');

    // 1. Buscar pedido — prioridade máxima nos campos customer_* do pedido
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

    // 2. Buscar cliente (apenas para CPF e bling_contact_id)
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, cpf, phone, bling_contact_id')
      .eq('phone', order.customer_phone)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // 3. Buscar token Bling
    const { data: blingConfig } = await supabase
      .from('integration_bling')
      .select('access_token, refresh_token, client_id, client_secret, token_expires_at')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!blingConfig?.access_token) {
      return new Response(
        JSON.stringify({ error: 'Integração Bling não configurada ou inativa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se o token precisa ser renovado
    let accessToken = blingConfig.access_token;
    if (blingConfig.token_expires_at) {
      const expiresAt = new Date(blingConfig.token_expires_at);
      const bufferMs = 5 * 60 * 1000;
      if (expiresAt.getTime() - Date.now() < bufferMs) {
        log('Token expirado, renovando...');
        if (blingConfig.refresh_token && blingConfig.client_id && blingConfig.client_secret) {
          try {
            const credentials = btoa(`${blingConfig.client_id}:${blingConfig.client_secret}`);
            const refreshRes = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${credentials}` },
              body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: blingConfig.refresh_token }),
            });
            if (refreshRes.ok) {
              const tokenData = await refreshRes.json();
              accessToken = tokenData.access_token;
              await supabase.from('integration_bling').update({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
              }).eq('tenant_id', tenant_id);
              log('Token renovado com sucesso');
            }
          } catch (e) {
            log(`Erro ao renovar token: ${(e as Error).message}`);
          }
        }
      }
    }

    const blingHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    // Endereço SEMPRE do pedido (pedido prevalece sobre cadastro do cliente)
    // Fallback para customer apenas se o campo do pedido estiver vazio
    const street = order.customer_street || '';
    const number = order.customer_number || 'S/N';
    const complement = order.customer_complement || '';
    const neighborhood = order.customer_neighborhood || '';
    const cep = (order.customer_cep || '').replace(/\D/g, '');
    const city = order.customer_city || '';
    const state = order.customer_state || '';
    const customerName = order.customer_name || customer?.name || '';

    log(`Endereço do pedido: ${street}, ${number} - ${neighborhood} - ${city}/${state} - CEP: ${cep}`);

    if (!street || !cep || !city || !state) {
      return new Response(
        JSON.stringify({ error: 'Endereço incompleto no pedido. Preencha rua, CEP, cidade e estado no pedido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cpfClean = (customer?.cpf || '').replace(/\D/g, '');

    // Resolver bling_contact_id
    // PRIORIDADE: 1) customer.bling_contact_id, 2) busca por CPF (numeroDocumento), 3) busca por pesquisa geral
    let blingContactId: number | null = customer?.bling_contact_id ?? null;

    if (!blingContactId && cpfClean) {
      // Busca por CPF usando o campo correto da API do Bling
      log(`Buscando contato por numeroDocumento (CPF): ${cpfClean}`);
      try {
        const cpfSearchRes = await fetch(`${BLING_API_URL}/contatos?pagina=1&limite=5&numeroDocumento=${encodeURIComponent(cpfClean)}`, {
          method: 'GET',
          headers: blingHeaders,
          signal: AbortSignal.timeout(10000),
        });
        if (cpfSearchRes.ok) {
          const cpfData = await cpfSearchRes.json();
          const contatos = cpfData?.data || [];
          if (contatos.length > 0) {
            blingContactId = typeof contatos[0].id === 'number' ? contatos[0].id : Number(contatos[0].id);
            log(`✅ Contato encontrado por CPF (numeroDocumento): ${blingContactId} — ${contatos[0].nome}`);
          } else {
            log(`Nenhum contato encontrado por CPF (numeroDocumento). Tentando pesquisa geral...`);
          }
        } else {
          const errorText = await cpfSearchRes.text();
          log(`Busca por numeroDocumento retornou ${cpfSearchRes.status}: ${errorText.slice(0, 200)}`);
        }
      } catch (err) {
        log(`Erro na busca por CPF: ${(err as Error).message}`);
      }
    }

    if (!blingContactId && cpfClean) {
      // Fallback: busca genérica pelo CPF
      log(`Buscando contato por pesquisa geral com CPF: ${cpfClean}`);
      try {
        const searchRes = await fetch(`${BLING_API_URL}/contatos?pagina=1&limite=5&pesquisa=${encodeURIComponent(cpfClean)}`, {
          method: 'GET',
          headers: blingHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const contatos = searchData?.data || [];
          if (contatos.length > 0) {
            blingContactId = typeof contatos[0].id === 'number' ? contatos[0].id : Number(contatos[0].id);
            log(`✅ Contato encontrado por pesquisa geral: ${blingContactId} — ${contatos[0].nome}`);
          }
        }
      } catch (err) {
        log(`Erro na pesquisa geral: ${(err as Error).message}`);
      }
    }

    if (!blingContactId && customerName) {
      // Último fallback: busca por nome
      log(`Buscando contato por nome: ${customerName}`);
      try {
        const nameSearchRes = await fetch(`${BLING_API_URL}/contatos?pagina=1&limite=5&pesquisa=${encodeURIComponent(customerName)}`, {
          method: 'GET',
          headers: blingHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (nameSearchRes.ok) {
          const nameData = await nameSearchRes.json();
          const contatos = nameData?.data || [];
          if (contatos.length > 0) {
            blingContactId = typeof contatos[0].id === 'number' ? contatos[0].id : Number(contatos[0].id);
            log(`✅ Contato encontrado por nome: ${blingContactId} — ${contatos[0].nome}`);
          }
        }
      } catch (err) {
        log(`Erro na busca por nome: ${(err as Error).message}`);
      }
    }

    // Payload do contato com o endereço do PEDIDO (sempre prevalece)
    const contactBody: Record<string, unknown> = {
      nome: customerName,
      tipo: 'F',
      situacao: 'A',
      endereco: {
        geral: {
          endereco: street,
          numero: number,
          complemento: complement,
          bairro: neighborhood,
          cep,
          municipio: city,
          uf: state,
        },
      },
    };

    if (cpfClean) {
      contactBody.numeroDocumento = cpfClean;
    }

    // Se encontrou o contato no Bling, fazer PUT para atualizar o endereço
    if (blingContactId) {
      log(`PUT /contatos/${blingContactId} com endereço do pedido`);
      
      const putRes = await fetch(`${BLING_API_URL}/contatos/${blingContactId}`, {
        method: 'PUT',
        headers: blingHeaders,
        body: JSON.stringify(contactBody),
        signal: AbortSignal.timeout(12000),
      });

      const putBody = await putRes.text();

      // Salvar bling_contact_id no customer para reutilizar
      if (customer?.id) {
        await supabase.from('customers').update({ bling_contact_id: blingContactId }).eq('id', customer.id);
      }

      if (putRes.status >= 200 && putRes.status < 300) {
        log(`✅ Contato ${blingContactId} atualizado com endereço do pedido`);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Endereço do pedido sincronizado no contato do Bling com sucesso!',
            bling_contact_id: blingContactId,
            address_used: { street, number, complement, neighborhood, cep, city, state }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      log(`❌ PUT falhou: HTTP ${putRes.status} — ${putBody.slice(0, 300)}`);
      return new Response(
        JSON.stringify({
          success: false,
          message: `Erro ao atualizar contato no Bling: HTTP ${putRes.status}`,
          bling_contact_id: blingContactId,
          detail: putBody.slice(0, 300)
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Contato não encontrado → criar novo com endereço do pedido
    log('Contato não encontrado no Bling. Criando novo contato com endereço do pedido...');

    const createRes = await fetch(`${BLING_API_URL}/contatos`, {
      method: 'POST',
      headers: blingHeaders,
      body: JSON.stringify(contactBody),
      signal: AbortSignal.timeout(12000),
    });
    const createBody = await createRes.text();

    if (createRes.status >= 200 && createRes.status < 300) {
      const created = JSON.parse(createBody);
      const newId = created?.data?.id ?? created?.id;
      blingContactId = typeof newId === 'number' ? newId : Number(newId);
      log(`✅ Contato criado com sucesso: ${blingContactId}`);

      if (customer?.id && blingContactId) {
        await supabase.from('customers').update({ bling_contact_id: blingContactId }).eq('id', customer.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Contato criado no Bling com endereço do pedido!',
          bling_contact_id: blingContactId
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tratar CPF duplicado — significa que existe um contato que não encontramos
    if (createBody.includes('já está cadastrado no contato') || createBody.includes('numeroDocumento')) {
      log(`CPF já cadastrado em outro contato. Tentando localizar pelo CPF novamente...`);
      
      // Extrair nome do contato existente da mensagem de erro do Bling
      const nameMatch = createBody.match(/cadastrado no contato ([^"]+)"/);
      const existingName = nameMatch ? nameMatch[1].trim() : null;
      
      if (existingName) {
        const nameSearchRes = await fetch(`${BLING_API_URL}/contatos?pagina=1&limite=5&pesquisa=${encodeURIComponent(existingName)}`, {
          method: 'GET',
          headers: blingHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (nameSearchRes.ok) {
          const nameData = await nameSearchRes.json();
          const contatos = nameData?.data || [];
          for (const c of contatos) {
            const cName = (c.nome || '').toUpperCase().trim();
            const eName = existingName.toUpperCase().trim();
            if (cName === eName || cName.includes(eName) || eName.includes(cName)) {
              blingContactId = typeof c.id === 'number' ? c.id : Number(c.id);
              log(`Contato existente encontrado pelo nome: ${blingContactId} — ${c.nome}`);
              
              if (customer?.id) {
                await supabase.from('customers').update({ bling_contact_id: blingContactId }).eq('id', customer.id);
              }

              // Atualizar endereço do contato encontrado
              const updateRes = await fetch(`${BLING_API_URL}/contatos/${blingContactId}`, {
                method: 'PUT',
                headers: blingHeaders,
                body: JSON.stringify(contactBody),
                signal: AbortSignal.timeout(12000),
              });
              await updateRes.text();
              
              return new Response(
                JSON.stringify({
                  success: true,
                  message: 'Contato existente localizado e endereço atualizado no Bling!',
                  bling_contact_id: blingContactId
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }
      }
    }

    log(`❌ POST /contatos falhou: HTTP ${createRes.status} — ${createBody.slice(0, 300)}`);
    return new Response(
      JSON.stringify({
        success: false,
        message: `Erro ao criar contato: HTTP ${createRes.status}`,
        detail: createBody.slice(0, 300)
      }),
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
