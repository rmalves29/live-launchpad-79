import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  // Em produção, prefira restringir:
  // 'Access-Control-Allow-Origin': 'https://app.orderzaps.com',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  // 1) PRE-FLIGHT
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const isGet = req.method === 'GET';
    const qsAction = url.searchParams.get('action') || undefined;
    const qsTenant = url.searchParams.get('tenant_id') || undefined;
    const body = !isGet ? await req.json().catch(() => ({})) : {};
    const action = qsAction ?? body.action ?? 'test_connection';
    const tenantId = qsTenant ?? body.tenant_id ?? '';
    let { order_id, customer_phone } = body;

    if (!tenantId) return j({ error: 'Missing tenant_id' }, 400);

    // Validar autenticação
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
    if (!user) {
      return j({ error: 'Unauthorized' }, 401);
    }
    
    // If tenant_id is not provided, get it from order
    let finalTenantId = tenantId;
    if (!finalTenantId && order_id) {
      const { data: orderData } = await supabaseAdmin
        .from('orders')
        .select('tenant_id')
        .eq('id', order_id)
        .single();
      
      if (orderData) {
        finalTenantId = orderData.tenant_id;
      }
    }
    
    // Validar se usuário pertence ao tenant
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id, role')
      .eq('id', user.id)
      .single();
    
    if (!profile) {
      return j({ error: 'Profile not found' }, 403);
    }
    
    // Super admin pode acessar qualquer tenant, usuários normais só o próprio tenant
    if (profile.role !== 'super_admin' && profile.tenant_id !== finalTenantId) {
      return j({ error: 'Forbidden - Invalid tenant access' }, 403);
    }
    
    console.log('Bling integration action:', action);

    // Usar cliente admin já configurado
    const supabase = supabaseAdmin;

    // Get Bling integration configuration from database
    const { data: blingConfig, error: configError } = await supabase
      .from('bling_integrations')
      .select('*')
      .eq('tenant_id', finalTenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !blingConfig) {
      console.error('Bling config not found:', configError);
      return j({ error: 'Configuração do Bling não encontrada' }, 500);
    }

    if (!blingConfig.access_token) {
      return j({ error: 'Access token do Bling não configurado' }, 401);
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
          
          return j({ 
            success: true,
            message: 'Conexão com Bling funcionando',
            user_data: userData
          });
        } else {
          const errorData = await testResponse.text();
          console.error('Teste de conexão Bling - erro:', testResponse.status, errorData);
          
          return j({ 
            success: false,
            error: 'Falha no teste de conexão',
            details: errorData 
          }, testResponse.status);
        }
      } catch (error) {
        console.error('Erro no teste de conexão:', error);
        return j({ 
          success: false,
          error: 'Erro interno no teste de conexão',
          details: error.message
        }, 500);
      }
    }

    if (action === 'create_order') {
      if (!order_id || !customer_phone) {
        return j({ error: 'order_id e customer_phone são obrigatórios' }, 400);
      }

      // Verificar se o token ainda é válido e tentar renovar se necessário
      let accessToken = blingConfig.access_token;
      
      if (blingConfig.expires_at && new Date(blingConfig.expires_at) <= new Date(Date.now() + 60000)) { // 60 segundos de margem
        console.log('Token do Bling expirando em breve, tentando renovar...');
        
        if (!blingConfig.refresh_token) {
          return j({ error: 'Token do Bling expirando e sem refresh_token. Reautorize a integração.' }, 401);
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
              .eq('tenant_id', finalTenantId);
            
            // Usar novo token
            accessToken = tokenData.access_token;
          } else {
            const errorData = await refreshResponse.text();
            console.error('Falha ao renovar token:', errorData);
            return j({ error: 'Falha ao renovar token do Bling. Reautorize a integração.' }, 401);
          }
        } catch (refreshError) {
          console.error('Erro ao renovar token:', refreshError);
          return j({ error: 'Erro ao renovar token do Bling. Reautorize a integração.' }, 401);
        }
      }

      // Helper functions
      function normalizeCustomerKey(data: { name?: string, phone?: string, cep?: string, cpf?: string }) {
        const normalizedPhone = data.phone?.replace(/\D/g, '') || '';
        const normalizedCep = data.cep?.replace(/\D/g, '') || '';
        const normalizedCpf = data.cpf?.replace(/\D/g, '') || '';
        
        return `${data.name?.trim()}-${normalizedPhone}-${normalizedCep}-${normalizedCpf}`.toLowerCase();
      }

      async function blingFetch(path: string, method: string, body: any, token: string) {
        const url = `https://api.bling.com.br/Api/v3${path}`;
        const options: RequestInit = {
          method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': '1.0',
            'Content-Type': 'application/json'
          }
        };
        
        if (body && method !== 'GET') {
          options.body = JSON.stringify(body);
        }
        
        return fetch(url, options);
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
        const key = normalizeCustomerKey({
          name: customer.nome,
          phone: customer.telefone,
          cep: customer.endereco?.cep,
          cpf: customer.cpf
        });

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
        if (customer.telefone) payload.fone = customer.telefone.replace(/\D/g, '');

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

        const createResponse = await blingFetch('/contatos', 'POST', payload, accessToken);
        
        if (!createResponse.ok) {
          const errorData = await createResponse.text();
          throw new Error(`Falha ao criar contato: ${createResponse.status} ${errorData}`);
        }
        
        const createData = await createResponse.json();
        
        if (!createData?.data?.id) {
          throw new Error(`Resposta inválida ao criar contato: ${JSON.stringify(createData)}`);
        }

        const newId = Number(createData.data.id);
        console.log('Contact created in Bling with ID:', newId);
        
        // Cache the contact ID
        await supabase.from('bling_contacts')
          .upsert({ tenant_id: tenantId, customer_key: key, bling_contact_id: newId });

        return newId;
      }

      // Verificar se pedido já foi processado (idempotência)
      const numeroLoja = `OZ-${finalTenantId.slice(0, 8)}-${order_id}`;
      
      // Buscar se pedido já existe no Bling
      const existingOrderResponse = await blingFetch(
        `/pedidos/vendas?numeroLoja=${numeroLoja}`,
        'GET',
        null,
        accessToken
      );
      
      if (existingOrderResponse.ok) {
        const existingData = await existingOrderResponse.json();
        if (existingData?.data && existingData.data.length > 0) {
          console.log('Pedido já existe no Bling:', numeroLoja);
          return j({ 
            success: true, 
            message: 'Pedido já existe no Bling',
            bling_order_id: existingData.data[0].id,
            numeroLoja 
          });
        }
      }

      // Buscar dados do pedido
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          cart_items:cart_items!inner(
            qty,
            unit_price,
            products:products!inner(
              id,
              name,
              code,
              price
            )
          )
        `)
        .eq('id', order_id)
        .single();

      if (orderError || !order) {
        console.error('Erro ao buscar pedido:', orderError);
        return j({ error: 'Pedido não encontrado' }, 404);
      }

      // Normalizar dados do cliente
      const normalizedPhone = customer_phone.replace(/\D/g, '');
      const normalizedCep = order.customer_cep?.replace(/\D/g, '') || '';

      // Get customer details
      let { data: customerData } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', finalTenantId)
        .or(`phone.eq.${customer_phone},phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
        .limit(1)
        .maybeSingle();

      // Buscar configuração da loja
      if (!blingConfig?.loja_id) {
        return j({ error: 'Código da Loja não configurado no Bling' }, 400);
      }

      // 1) Garantir/obter o contato.id
      const contactId = await getOrCreateContactId(finalTenantId, {
        nome: customerData?.name || order.customer_name || "Cliente",
        email: customerData?.email || `${normalizedPhone}@checkout.com`,
        telefone: normalizedPhone,
        cpf: customerData?.cpf?.replace(/\D/g, ''),
        endereco: {
          endereco: customerData?.street || order.customer_street || "Rua não informada",
          numero: customerData?.number || order.customer_number || "S/N",
          complemento: customerData?.complement || order.customer_complement || "",
          bairro: customerData?.city || order.customer_city || "Centro",
          cidade: customerData?.city || order.customer_city || "São Paulo",
          uf: customerData?.state || order.customer_state || "SP",
          cep: (customerData?.cep || order.customer_cep || "00000000").replace(/\D/g, '')
        }
      });

      // 2) Criar estrutura do pedido para o Bling
      const orderData = {
        data: new Date(order.event_date).toISOString().split('T')[0],
        numeroLoja,
        loja: {
          id: parseInt(blingConfig.loja_id)
        },
        contato: { id: contactId },
        itens: (order.cart_items || []).map((item: any) => ({
          produto: {
            codigo: item.products?.code || `ITEM-${item.id}`
          },
          quantidade: item.qty,
          preco: Number(item.unit_price)
        })),
        observacoes: order.observation || `Pedido via sistema - Evento: ${order.event_type}`
      };

      console.log('Sending order to Bling:', JSON.stringify(orderData, null, 2));
      console.log('Using contact ID:', contactId);

      // Send order to Bling API v3
      const blingResponse = await blingFetch('/pedidos/vendas', 'POST', orderData, accessToken);

      if (!blingResponse.ok) {
        const errorData = await blingResponse.text();
        console.error('Bling API error:', blingResponse.status, errorData);
        
        // Tratamento específico para erro de escopo insuficiente
        if (blingResponse.status === 403 && errorData.includes('insufficient_scope')) {
          return j({ 
            error: 'Escopo insuficiente na API do Bling',
            details: 'Verifique se a autorização possui os escopos: 404481, 404482',
            raw_error: errorData
          }, 403);
        }
        
        return j({ 
          error: 'Falha ao criar pedido no Bling',
          status: blingResponse.status,
          details: errorData
        }, blingResponse.status);
      }

      const blingData = await blingResponse.json();
      console.log('Bling response:', JSON.stringify(blingData, null, 2));

      // Log the activity
      await supabase
        .from('webhook_logs')
        .insert({
          tenant_id: finalTenantId,
          webhook_type: 'bling_integration',
          status_code: 200,
          payload: { action: 'create_order', order_id, customer_phone },
          response: JSON.stringify(blingData)
        });

      return j({ 
        success: true,
        message: 'Pedido criado no Bling com sucesso',
        bling_order_id: blingData?.data?.id,
        numeroLoja,
        bling_response: blingData
      });
    }

    return j({ error: 'Ação não suportada' }, 400);

  } catch (e: any) {
    console.error('Erro interno da função:', e);
    return j({ 
      error: 'Erro interno',
      details: e?.message ?? String(e)
    }, 500);
  }
});