import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { action, order_id, customer_phone } = requestBody;
    let { tenant_id } = requestBody;
    
    // If tenant_id is not provided, get it from order
    if (!tenant_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: orderData } = await supabase
        .from('orders')
        .select('tenant_id')
        .eq('id', order_id)
        .single();
      
      if (orderData) {
        tenant_id = orderData.tenant_id;
      }
    }
    
    console.log('Bling integration action:', action);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Bling integration configuration from database
    const { data: blingConfig, error: configError } = await supabase
      .from('bling_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !blingConfig) {
      console.error('Bling config not found:', configError);
      return new Response(
        JSON.stringify({ error: 'Configuração do Bling não encontrada' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!blingConfig.access_token) {
      return new Response(
        JSON.stringify({ error: 'Access token do Bling não configurado' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Using Bling config:', { 
      environment: blingConfig.environment, 
      has_client_id: !!blingConfig.client_id,
      expires_at: blingConfig.expires_at,
      token_expired: blingConfig.expires_at ? new Date(blingConfig.expires_at) <= new Date() : 'unknown'
    });

    if (action === 'test_connection') {
      // Testar conexão com Bling e verificar escopos
      try {
        const testResponse = await fetch('https://api.bling.com.br/Api/v3/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${blingConfig.access_token}`,
          }
        });

        if (testResponse.ok) {
          const userData = await testResponse.json();
          console.log('Teste de conexão Bling - sucesso:', userData);
          
          return new Response(
            JSON.stringify({ 
              success: true,
              message: 'Conexão com Bling funcionando',
              user_data: userData
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } else {
          const errorData = await testResponse.text();
          console.error('Teste de conexão Bling - erro:', testResponse.status, errorData);
          
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Falha no teste de conexão',
              details: errorData 
            }),
            { status: testResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (error) {
        console.error('Erro no teste de conexão:', error);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Erro interno no teste de conexão',
            details: error.message
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    if (action === 'create_order') {
      if (!order_id || !customer_phone) {
        return new Response(
          JSON.stringify({ error: 'order_id e customer_phone são obrigatórios' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Verificar se o token ainda é válido e tentar renovar se necessário
      if (blingConfig.expires_at && new Date(blingConfig.expires_at) <= new Date()) {
        console.log('Token do Bling expirado, tentando renovar...');
        
        if (!blingConfig.refresh_token) {
          return new Response(
            JSON.stringify({ error: 'Token do Bling expirado e sem refresh_token. Reautorize a integração.' }),
            { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }

        // Tentar renovar o token
        try {
          const refreshResponse = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${blingConfig.client_id}:${blingConfig.client_secret}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: blingConfig.refresh_token
            })
          });

          if (refreshResponse.ok) {
            const tokenData = await refreshResponse.json();
            console.log('Token renovado com sucesso');
            
            // Atualizar token no banco
            const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
            
            await supabase
              .from('bling_integrations')
              .update({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token || blingConfig.refresh_token,
                expires_at: expiresAt,
                updated_at: new Date().toISOString()
              })
              .eq('tenant_id', tenant_id);
            
            // Atualizar config local
            blingConfig.access_token = tokenData.access_token;
            blingConfig.expires_at = expiresAt;
          } else {
            const errorData = await refreshResponse.text();
            console.error('Falha ao renovar token:', errorData);
            return new Response(
              JSON.stringify({ error: 'Falha ao renovar token do Bling. Reautorize a integração.' }),
              { 
                status: 401, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
        } catch (refreshError) {
          console.error('Erro ao renovar token:', refreshError);
          return new Response(
            JSON.stringify({ error: 'Erro ao renovar token do Bling. Reautorize a integração.' }),
            { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
      }

      // Get order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .eq('tenant_id', tenant_id)
        .single();

      if (orderError || !orderData) {
        console.error('Order not found:', orderError);
        return new Response(
          JSON.stringify({ error: 'Pedido não encontrado' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Helper functions
      function normalizeCustomerKey(cpf?: string, email?: string) {
        if (cpf) return cpf.replace(/\D/g, '');
        if (email) return email.trim().toLowerCase();
        throw new Error('Sem chave de cliente (CPF ou email)');
      }

      async function blingFetch(path: string, opts: RequestInit & { token: string }) {
        const url = `https://api.bling.com.br/Api/v3${path}`;
        const res = await fetch(url, {
          ...opts,
          headers: {
            Authorization: `Bearer ${opts.token}`,
            Accept: '1.0',
            ...(opts.headers || {})
          }
        });
        let data: any = null;
        const text = await res.text();
        try { 
          data = text ? JSON.parse(text) : null; 
        } catch { 
          data = { raw: text }; 
        }
        return { res, data };
      }

      async function getOrCreateContactId(
        tenantId: string,
        customer: {
          nome: string,
          cpf?: string,
          email?: string,
          telefone?: string,
          endereco?: {
            endereco?: string, numero?: string, complemento?: string,
            bairro?: string, cidade?: string, uf?: string, cep?: string
          }
        }
      ): Promise<number> {
        const key = normalizeCustomerKey(customer.cpf, customer.email);

        // 1) Ver se já temos em cache
        const { data: cached } = await supabase
          .from('bling_contacts')
          .select('bling_contact_id')
          .eq('tenant_id', tenantId)
          .eq('customer_key', key)
          .maybeSingle();

        if (cached?.bling_contact_id) {
          console.log('Using cached contact ID:', cached.bling_contact_id);
          return Number(cached.bling_contact_id);
        }

        // 2) Criar contato no Bling
        const payload: any = {
          nome: customer.nome,
          tipo: 'F', // F = Pessoa Física, J = Pessoa Jurídica
          situacao: 'A' // A = Ativo, I = Inativo, E = Excluído, S = Sem movimento
        };

        if (customer.email) payload.email = customer.email;
        if (customer.telefone) payload.fone = customer.telefone;

        // Se tiver CPF, ajuda em deduplicação futura
        if (customer.cpf) {
          payload.numeroDocumento = customer.cpf.replace(/\D/g, '');
        }

        if (customer.endereco) {
          payload.endereco = {
            endereco: customer.endereco.endereco || '',
            numero: customer.endereco.numero || '',
            complemento: customer.endereco.complemento || '',
            bairro: customer.endereco.bairro || '',
            cidade: customer.endereco.cidade || '',
            uf: customer.endereco.uf || '',
            cep: (customer.endereco.cep || '').replace(/\D/g, '')
          };
        }

        console.log('Creating contact in Bling:', JSON.stringify(payload, null, 2));

        const { res: rCreate, data: dCreate } = await blingFetch('/contatos', {
          token: blingConfig.access_token,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!rCreate.ok || !dCreate?.data?.id) {
          throw new Error(`Falha ao criar contato: ${rCreate.status} ${JSON.stringify(dCreate)}`);
        }

        const newId = Number(dCreate.data.id);
        console.log('Contact created in Bling with ID:', newId);
        
        // Cache the contact ID
        await supabase.from('bling_contacts')
          .upsert({ tenant_id: tenantId, customer_key: key, bling_contact_id: newId });

        return newId;
      }

      // Get customer details
      const phoneDigits = customer_phone.replace(/\D/g, '');
      let { data: customerData } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', tenant_id)
        .or(`phone.eq.${customer_phone},phone.eq.${phoneDigits},phone.ilike.%${phoneDigits}%`)
        .limit(1)
        .maybeSingle();

      // Get cart items
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select(`
          *,
          products (
            name,
            code,
            price
          )
        `)
        .eq('tenant_id', tenant_id)
        .eq('cart_id', orderData.cart_id || 0);

      // 1) Garantir/obter o contato.id
      const contactId = await getOrCreateContactId(tenant_id, {
        nome: customerData?.name || "Cliente",
        email: customerData?.email || `${customer_phone}@checkout.com`,
        telefone: customer_phone,
        cpf: customerData?.cpf,
        endereco: {
          endereco: customerData?.street || "Rua não informada",
          numero: customerData?.number || "S/N",
          complemento: customerData?.complement || "",
          bairro: customerData?.city || "Centro",
          cidade: customerData?.city || "São Paulo",
          uf: customerData?.state || "SP",
          cep: customerData?.cep || "00000000"
        }
      });

      // 2) Criar o pedido usando contato.id
      // Criar ID único para o pedido
      const uniqueOrderId = `PED-${Date.now()}-${orderData.id}`;
      
      const blingOrder = {
        data: new Date(orderData.created_at).toISOString().split('T')[0],
        numeroLoja: uniqueOrderId,
        contato: { id: contactId },
        itens: (cartItems || []).map((item: any) => ({
          produto: {
            codigo: item.products?.code || `ITEM-${item.id}`
          },
          quantidade: item.qty,
          preco: item.unit_price
        })),
        observacoes: orderData.observation || `Pedido via sistema - Evento: ${orderData.event_type}`
      };

      console.log('Sending order to Bling:', JSON.stringify(blingOrder, null, 2));
      console.log('Using contact ID:', contactId);

      // API v3 URL
      const apiUrl = 'https://api.bling.com.br/Api/v3/pedidos/vendas';

      // Send order to Bling API v3 using helper
      const { res: blingResponse, data: blingData } = await blingFetch('/pedidos/vendas', {
        token: blingConfig.access_token,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blingOrder)
      });

      if (!blingResponse.ok) {
        console.error('Bling API error:', blingResponse.status, JSON.stringify(blingData));
        
        // Tratamento específico para erro de escopo insuficiente
        if (blingResponse.status === 403 && JSON.stringify(blingData).includes('insufficient_scope')) {
          return new Response(
            JSON.stringify({ 
              error: 'Escopo insuficiente na API do Bling',
              details: 'O aplicativo no Bling não tem permissões para criar pedidos. Verifique as configurações do aplicativo no painel do Bling e certifique-se de que tenha acesso aos módulos de Pedidos/Vendas.',
              bling_error: blingData 
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro na API do Bling',
            details: blingData 
          }),
          { status: blingResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Bling response:', JSON.stringify(blingData, null, 2));

      // Log the integration
      await supabase
        .from('webhook_logs')
        .insert({
          tenant_id: tenant_id,
          webhook_type: 'bling_order_created',
          status_code: 200,
          payload: {
            order_id: orderData.id,
            bling_response: blingData,
            sent_at: new Date().toISOString()
          },
          response: JSON.stringify(blingData)
        });

      return new Response(
        JSON.stringify({ 
          success: true,
          bling_order_id: blingData.data?.id || 'N/A',
          message: 'Pedido enviado para o Bling com sucesso'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não suportada' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in Bling integration:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno',
        details: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});