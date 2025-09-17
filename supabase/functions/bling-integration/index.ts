import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.orderzaps.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  // Handle CORS preflight requests
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

    // Helper para fazer requisições ao Bling com headers corretos
    async function blingFetch(path: string, method: string, body: any, token: string, retryCount = 0): Promise<Response> {
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
      
      const response = await fetch(url, options);
      
      // Se 401 e temos refresh token, tentar renovar uma vez
      if (response.status === 401 && retryCount === 0 && blingConfig.refresh_token) {
        console.log('Token inválido, tentando refresh automático...');
        
        const refreshed = await refreshBlingToken(supabase, finalTenantId, blingConfig);
        if (refreshed) {
          console.log('Token renovado, tentando novamente...');
          return blingFetch(path, method, body, refreshed, retryCount + 1);
        }
      }
      
      return response;
    }

    // Helper para renovar token automaticamente
    async function refreshBlingToken(supabase: any, tenantId: string, config: any): Promise<string | null> {
      try {
        const refreshResponse = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${config.client_id}:${config.client_secret}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': '1.0'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: config.refresh_token
          })
        });

        if (refreshResponse.ok) {
          const tokenData = await refreshResponse.json();
          const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
          
          await supabase
            .from('bling_integrations')
            .update({
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token || config.refresh_token,
              expires_at: expiresAt,
              updated_at: new Date().toISOString()
            })
            .eq('tenant_id', tenantId);
          
          return tokenData.access_token;
        }
      } catch (error) {
        console.error('Erro ao renovar token:', error);
      }
      return null;
    }

    if (action === 'test_connection') {
      try {
        const testResponse = await blingFetch('/me', 'GET', null, blingConfig.access_token);

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
        
        const refreshedToken = await refreshBlingToken(supabase, finalTenantId, blingConfig);
        if (refreshedToken) {
          accessToken = refreshedToken;
        } else {
          return j({ error: 'Token do Bling expirado. Reautorize a integração.' }, 401);
        }
      }

      // Verificar se pedido já foi processado (idempotência)
      const numeroLoja = `OZ-${finalTenantId.slice(0, 8)}-${order_id}`;
      
      console.log('Verificando se pedido existe no Bling:', numeroLoja);
      
      // Buscar se pedido já existe no Bling
      const existingOrderResponse = await blingFetch(
        `/pedidos/vendas?numeroLoja=${numeroLoja}`,
        'GET',
        null,
        accessToken
      );
      
      if (existingOrderResponse.ok) {
        const existingData = await existingOrderResponse.json();
        console.log('Dados retornados da verificação:', JSON.stringify(existingData, null, 2));
        
        if (existingData?.data && Array.isArray(existingData.data) && existingData.data.length > 0) {
          console.log('Pedido já existe no Bling:', numeroLoja, 'ID:', existingData.data[0].id);
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

      // Normalizar dados do cliente (apenas dígitos)
      const normalizedPhone = customer_phone.replace(/\D/g, '');
      const normalizedCep = (order.customer_cep || '').replace(/\D/g, '');

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

      // Função para normalizar chave do contato para cache
      function normalizeCustomerKey(data: { name?: string, phone?: string, cep?: string, cpf?: string }) {
        const normalizedPhone = data.phone?.replace(/\D/g, '') || '';
        const normalizedCep = data.cep?.replace(/\D/g, '') || '';
        const normalizedCpf = data.cpf?.replace(/\D/g, '') || '';
        
        return `${data.name?.trim()}-${normalizedPhone}-${normalizedCep}-${normalizedCpf}`.toLowerCase();
      }

      // Função para obter ou criar contato no Bling
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

        // 2) Criar contato no Bling conforme payload mínimo especificado
        const payload: any = {
          nome: customer.nome,
          tipoPessoa: 'F', // F = Pessoa Física, J = Pessoa Jurídica
          email: customer.email || `${customer.telefone?.replace(/\D/g, '')}@checkout.com`,
          fone: customer.telefone?.replace(/\D/g, '') || ''
        };

        // CPF/CNPJ normalizado (apenas dígitos)
        if (customer.cpf) {
          const cleanCpf = customer.cpf.replace(/\D/g, '');
          if (cleanCpf.length === 11) {
            payload.numeroDocumento = cleanCpf;
            payload.tipoPessoa = 'F';
          } else if (cleanCpf.length === 14) {
            payload.numeroDocumento = cleanCpf;
            payload.tipoPessoa = 'J';
          }
        }

        // Endereço conforme payload mínimo
        if (customer.endereco) {
          payload.endereco = {
            endereco: customer.endereco.endereco || 'Rua não informada',
            numero: customer.endereco.numero || 'S/N',
            complemento: customer.endereco.complemento || '',
            bairro: customer.endereco.bairro || 'Centro',
            cidade: customer.endereco.cidade || 'São Paulo',
            uf: customer.endereco.uf || 'SP',
            cep: (customer.endereco.cep || '00000000').replace(/\D/g, '')
          };
        }

        console.log('Creating contact in Bling:', JSON.stringify(payload, null, 2));

        const createResponse = await blingFetch('/contatos', 'POST', payload, accessToken);
        
        if (!createResponse.ok) {
          const errorData = await createResponse.text();
          console.error('Erro ao criar contato:', createResponse.status, errorData);
          
          // Log erro no webhook_logs
          await supabase.from('webhook_logs').insert({
            tenant_id: finalTenantId,
            webhook_type: 'bling_create_contact_error',
            status_code: createResponse.status,
            payload: { customer, action: 'create_contact' },
            response: errorData,
            error_message: `Falha ao criar contato: ${createResponse.status}`
          });
          
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

      // 1) Garantir/obter o contato.id (OBRIGATÓRIO antes do pedido)
      const contactId = await getOrCreateContactId(finalTenantId, {
        nome: customerData?.name || order.customer_name || "Cliente",
        email: customerData?.email,
        telefone: normalizedPhone,
        cpf: customerData?.cpf,
        endereco: {
          endereco: customerData?.street || order.customer_street || "Rua não informada",
          numero: customerData?.number || order.customer_number || "S/N",
          complemento: customerData?.complement || order.customer_complement || "",
          bairro: customerData?.city || order.customer_city || "Centro",
          cidade: customerData?.city || order.customer_city || "São Paulo",
          uf: customerData?.state || order.customer_state || "SP",
          cep: normalizedCep || "00000000"
        }
      });

      // 2) Criar estrutura do pedido para o Bling conforme payload mínimo
      const orderData = {
        data: new Date(order.event_date).toISOString().split('T')[0],
        numeroLoja, // Formato: OZ-<tenant>-<pedidoId>
        loja: {
          id: parseInt(blingConfig.loja_id) // Código da Loja no Bling (OBRIGATÓRIO)
        },
        contato: { 
          id: contactId // id do contato criado/buscado (OBRIGATÓRIO)
        },
        itens: (order.cart_items || []).map((item: any) => ({
          produto: {
            codigo: item.products?.code || `ITEM-${item.id}` // ou { "id": 111 }
          },
          quantidade: item.qty,
          preco: Number(item.unit_price) // Preço com ponto decimal
        })),
        observacoes: order.observation || `Pedido via sistema - Evento: ${order.event_type}`
      };

      console.log('Sending order to Bling:', JSON.stringify(orderData, null, 2));

      // Send order to Bling API v3
      const blingResponse = await blingFetch('/pedidos/vendas', 'POST', orderData, accessToken);
      const responseHeaders = blingResponse.headers;
      const requestId = responseHeaders.get('x-request-id') || 'N/A';

      console.log('Bling response:', {
        status: blingResponse.status,
        ok: blingResponse.ok,
        'x-request-id': requestId
      });

      const responseText = await blingResponse.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      // Log webhook activity
      await supabase
        .from('webhook_logs')
        .insert({
          tenant_id: finalTenantId,
          webhook_type: 'bling_integration',
          status_code: blingResponse.status,
          payload: { action: 'create_order', order_id, customer_phone, numeroLoja, contact_id: contactId },
          response: responseText,
          error_message: !blingResponse.ok ? `Falha ao criar pedido no Bling: ${blingResponse.status}` : null
        });

      if (!blingResponse.ok) {
        console.error('Bling API error:', blingResponse.status, responseData);
        
        // Tratamento específico para códigos de erro comuns
        if (blingResponse.status === 401) {
          return j({ 
            error: 'Token inválido ou expirado',
            details: 'invalid_token - token expirado/refresh não feito',
            raw_error: responseData,
            'x-request-id': requestId
          }, 401);
        }
        
        if (blingResponse.status === 403) {
          return j({ 
            error: 'Escopo insuficiente na API do Bling',
            details: 'insufficient_scope - app não autorizado com escopos que liberem contatos e pedidos',
            raw_error: responseData,
            'x-request-id': requestId
          }, 403);
        }
        
        if (blingResponse.status === 409) {
          return j({ 
            success: true, // 409 indica que já existe (idempotência)
            message: 'Pedido já existe no Bling (duplicado)',
            numeroLoja,
            details: 'numeroLoja já existe - idempotência detectada',
            'x-request-id': requestId
          });
        }
        
        return j({ 
          error: 'Falha ao criar pedido no Bling',
          status: blingResponse.status,
          details: responseData,
          'x-request-id': requestId
        }, blingResponse.status);
      }

      console.log('Pedido criado com sucesso no Bling:', responseData);
      return j({ 
        success: true,
        message: 'Pedido criado com sucesso no Bling',
        bling_order_id: responseData?.data?.id,
        numeroLoja,
        contact_id: contactId,
        'x-request-id': requestId
      });
    }

    return j({ error: 'Ação não suportada' }, 400);

  } catch (error) {
    console.error('Erro na função Bling integration:', error);
    
    return j({ 
      error: 'Erro interno do servidor',
      details: error.message
    }, 500);
  }
});