// Serviço para integração com o servidor WhatsApp
import { normalizeForSending } from './phone-utils';
import { supabase } from '@/integrations/supabase/client';

// Função para buscar template do tenant
async function getTemplate(tenantId: string, templateType: string): Promise<string | null> {
  try {
    console.log('🎨 [Template] Buscando template:', { tenantId, templateType });
    
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('content')
      .eq('tenant_id', tenantId)
      .eq('type', templateType as any)
      .maybeSingle();
    
    if (error) {
      console.error('❌ [Template] Erro ao buscar:', error);
      return null;
    }
    
    if (!data) {
      console.warn('⚠️ [Template] Template não encontrado:', templateType);
      return null;
    }
    
    console.log('✅ [Template] Template encontrado');
    return data.content;
  } catch (error) {
    console.error('❌ [Template] Falha crítica:', error);
    return null;
  }
}

// Função para substituir variáveis no template
function replaceTemplateVars(template: string, vars: Record<string, any>): string {
  let result = template;
  
  Object.entries(vars).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value ?? ''));
  });
  
  return result;
}

// Função para obter a URL do servidor WhatsApp configurada
async function getWhatsAppServerUrl(tenantId: string): Promise<string> {
  try {
    console.log('🔍 [WS] Buscando URL do servidor WhatsApp para tenant:', tenantId);
    
    const { data, error } = await supabase
      .from('integration_whatsapp')
      .select('api_url')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (error) {
      console.error('❌ [WS] Erro ao buscar configuração:', error);
      throw new Error(`Erro ao buscar configuração WhatsApp: ${error.message}`);
    }
    
    if (!data || !data.api_url) {
      console.error('❌ [WS] Configuração não encontrada ou api_url vazia');
      throw new Error('Integração WhatsApp não configurada. Configure a URL da API em Integrações > WhatsApp.');
    }
    
    console.log('✅ [WS] URL encontrada:', data.api_url);
    return data.api_url;
  } catch (error) {
    console.error('❌ [WS] Falha crítica ao obter URL:', error);
    throw error;
  }
}

interface WhatsAppResponse {
  ok?: boolean;
  success?: boolean;
  error?: string;
  total?: number;
}

interface Product {
  name: string;
  code?: string;
  qty: number;
  price: number;
}

interface OrderData {
  customer_phone: string;
  customer_name?: string;
  order_id?: string;
  total_amount?: number;
  product?: Product;
}

class WhatsAppService {
  private async makeRequest(endpoint: string, data: any, tenantId?: string): Promise<WhatsAppResponse> {
    try {
      console.log('🔍 [WS] makeRequest chamado:', { endpoint, tenantId, hasData: !!data });
      console.log('📦 [WS] Data recebido:', JSON.stringify(data, null, 2));
      
      if (!tenantId) {
        throw new Error('Tenant ID é obrigatório para enviar mensagens WhatsApp');
      }

      let serverUrl: string;
      
      try {
        serverUrl = await getWhatsAppServerUrl(tenantId);
      } catch (configError: any) {
        console.error('❌ [WS] Falha ao obter configuração:', configError);
        throw new Error(`❌ Servidor WhatsApp offline\n\nPedido criado com sucesso, mas o servidor WhatsApp não está respondendo. Inicie o NodeJs.`);
      }
      
      console.log('🌐 [WS] URL do servidor:', serverUrl);
      
      // Garantir que tenant_id está no data
      const requestData = {
        ...data,
        tenant_id: tenantId
      };
      
      console.log('📤 [WS] Dados finais a enviar:', JSON.stringify(requestData, null, 2));
      
      const fullUrl = `${serverUrl}${endpoint}`;
      console.log('🔗 [WS] URL completa:', fullUrl);
      console.log('🔑 [WS] Header x-tenant-id:', tenantId);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      let response: Response;
      
      try {        
        response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId
          },
          body: JSON.stringify(requestData),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.error('❌ [WS] Erro de conexão:', fetchError);
        
        if (fetchError.name === 'AbortError') {
          throw new Error(`❌ Servidor WhatsApp offline\n\nTimeout ao conectar com ${serverUrl}. Verifique se o servidor Node.js está rodando.`);
        }
        
        throw new Error(`❌ Servidor WhatsApp offline\n\nNão foi possível conectar em ${serverUrl}. Verifique se o servidor Node.js está rodando e acessível.`);
      }

      console.log('📥 [WS] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [WS] Erro na resposta:', errorText);
        console.error('❌ [WS] Status code:', response.status);
        
        try {
          const errorData = JSON.parse(errorText);
          const errorMsg = errorData.error || `Erro HTTP ${response.status}`;
          console.error('❌ [WS] Mensagem de erro:', errorMsg);
          throw new Error(errorMsg);
        } catch {
          throw new Error(`Servidor WhatsApp retornou erro ${response.status}. Verifique os logs do Node.js.`);
        }
      }

      const result = await response.json();
      console.log('✅ [WS] Resposta sucesso:', result);
      return result;
    } catch (error: any) {
      console.error(`❌ [WS] Erro ao chamar ${endpoint}:`, error);
      throw error;
    }
  }

  async sendItemAdded(orderData: OrderData, tenantId: string): Promise<WhatsAppResponse> {
    if (!orderData.product) {
      throw new Error('Product data is required');
    }

    console.log('📤 [sendItemAdded] Iniciando envio:', { 
      tenantId, 
      phone: orderData.customer_phone,
      product: orderData.product.name 
    });

    // Buscar template ITEM_ADDED do tenant
    let message = await getTemplate(tenantId, 'ITEM_ADDED');
    
    if (!message) {
      // Fallback para mensagem padrão
      console.warn('⚠️ [sendItemAdded] Usando template padrão');
      message = `🛒 *Item adicionado ao pedido*\n\n✅ {{produto}}\nQtd: *{{quantidade}}*\nValor: *R$ {{valor}}*\n\nDigite *FINALIZAR* para concluir seu pedido.`;
    }
    
    // Substituir variáveis do template
    message = replaceTemplateVars(message, {
      produto: orderData.product.name,
      quantidade: orderData.product.qty,
      valor: orderData.product.price.toFixed(2)
    });

    console.log('📝 [sendItemAdded] Mensagem final:', message.substring(0, 100) + '...');
    console.log('🔑 [sendItemAdded] TenantId a ser enviado:', tenantId);

    // Usar endpoint /send do Node.js com tenant_id explícito
    const payload = {
      tenant_id: tenantId,
      number: normalizeForSending(orderData.customer_phone),
      message,
    };
    
    console.log('📦 [sendItemAdded] Payload completo:', JSON.stringify(payload, null, 2));
    
    return this.makeRequest('/send', payload, tenantId);
  }

  async sendItemCancelled(orderData: OrderData): Promise<WhatsAppResponse> {
    if (!orderData.product) {
      throw new Error('Product data is required');
    }

    const message = `❌ *Produto Cancelado*\n\nO produto "${orderData.product.name}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.`;

    return this.makeRequest('/send', {
      number: normalizeForSending(orderData.customer_phone),
      message,
    });
  }

  async sendOrderCreated(orderData: OrderData): Promise<WhatsAppResponse> {
    const message = `🎉 *Pedido Criado - #${orderData.order_id}*\n\nOlá ${orderData.customer_name || 'Cliente'}!\n\nSeu pedido foi criado com sucesso!\n💰 Total: *R$ ${orderData.total_amount?.toFixed(2)}*\n\nEm breve você receberá o link de pagamento.`;

    return this.makeRequest('/send', {
      number: normalizeForSending(orderData.customer_phone),
      message,
    });
  }

  async broadcastByPhones(phones: string[], message: string, tenantId?: string): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/broadcast/by-phones', {
      key: 'whatsapp-broadcast-2024', // BROADCAST_SECRET
      phones: phones.map(phone => normalizeForSending(phone)),
      message,
      interval: 2000,
      batchSize: 5,
      batchDelay: 3000,
    }, tenantId);
  }

  async broadcastByOrderStatus(status: 'paid' | 'unpaid' | 'all', message: string): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/broadcast/orders', {
      key: 'whatsapp-broadcast-2024', // BROADCAST_SECRET
      status,
      message,
      interval: 2000,
      batchSize: 5,
      batchDelay: 3000,
    });
  }

  async broadcastByOrderStatusAndDate(
    status: 'paid' | 'unpaid' | 'all', 
    message: string, 
    tenantId: string,
    orderDate?: string
  ): Promise<WhatsAppResponse> {
    console.log('📤 [broadcastByOrderStatusAndDate] Iniciando:', { status, tenantId, orderDate });

    // Buscar telefones únicos dos pedidos
    let query = supabase
      .from('orders')
      .select('customer_phone')
      .eq('tenant_id', tenantId);

    if (status === 'paid') {
      query = query.eq('is_paid', true);
    } else if (status === 'unpaid') {
      query = query.eq('is_paid', false);
    }

    if (orderDate) {
      query = query.eq('event_date', orderDate);
    }

    const { data: orders, error } = await query;
    if (error) throw error;

    const uniquePhones = [...new Set(orders?.map(o => o.customer_phone) || [])];
    console.log(`📤 [broadcast] ${uniquePhones.length} telefones únicos encontrados`);
    
    // Usar servidor Node do tenant
    return this.makeRequest('/api/broadcast/by-phones', {
      key: 'whatsapp-broadcast-2024',
      phones: uniquePhones.map(phone => normalizeForSending(phone)),
      message,
      interval: 2000,
      batchSize: 5,
      batchDelay: 3000,
    }, tenantId);
  }

  async getContactCount(
    status: 'paid' | 'unpaid' | 'all',
    tenantId: string,
    orderDate?: string
  ): Promise<number> {
    const { supabase } = await import('@/integrations/supabase/client');
    
    let query = supabase
      .from('orders')
      .select('customer_phone', { count: 'exact', head: false })
      .eq('tenant_id', tenantId);

    if (status === 'paid') {
      query = query.eq('is_paid', true);
    } else if (status === 'unpaid') {
      query = query.eq('is_paid', false);
    }

    if (orderDate) {
      query = query.eq('event_date', orderDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao contar contatos:', error);
      return 0;
    }

    // Contar telefones únicos
    const uniquePhones = new Set(data?.map(order => order.customer_phone) || []);
    return uniquePhones.size;
  }

  async sendSimpleMessage(phone: string, message: string, tenantId?: string): Promise<WhatsAppResponse> {
    const normalizedPhone = normalizeForSending(phone);
    
    console.log('📞 [WS] sendSimpleMessage:', {
      phoneOriginal: phone,
      phoneNormalized: normalizedPhone,
      messageLength: message.length,
      tenantId,
      endpoint: '/send'
    });
    
    return this.makeRequest('/send', {
      number: normalizedPhone,
      message,
    }, tenantId);
  }

  async addLabel(phone: string, label: string): Promise<WhatsAppResponse> {
    return this.makeRequest('/add-label', {
      phone: normalizeForSending(phone),
      label,
    });
  }

  async sendProductCanceledMessage(
    phone: string, 
    productName: string, 
    productCode: string,
    tenantId?: string
  ): Promise<WhatsAppResponse> {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    console.log('📤 [sendProductCanceled] Enviando mensagem de cancelamento:', { 
      phone, 
      productName,
      productCode,
      tenantId 
    });

    // Buscar template PRODUCT_CANCELED do tenant
    let message = await getTemplate(tenantId, 'PRODUCT_CANCELED');
    
    if (!message) {
      // Fallback para mensagem padrão
      console.warn('⚠️ [sendProductCanceled] Usando template padrão');
      message = `❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.`;
    }
    
    // Substituir variáveis do template
    message = replaceTemplateVars(message, {
      produto: productName,
      codigo: productCode
    });

    console.log('📝 [sendProductCanceled] Mensagem final:', message.substring(0, 100) + '...');

    // Usar endpoint /send do Node.js
    return this.makeRequest('/send', {
      number: normalizeForSending(phone),
      message,
    }, tenantId);
  }

  async sendPaidOrderMessage(
    phone: string,
    orderId: number,
    totalAmount: number,
    tenantId: string
  ): Promise<WhatsAppResponse> {
    console.log('📤 [sendPaidOrder] Enviando confirmação de pagamento:', { 
      phone, 
      orderId,
      totalAmount,
      tenantId 
    });

    // Buscar template PAID_ORDER do tenant
    let message = await getTemplate(tenantId, 'PAID_ORDER');
    
    if (!message) {
      // Fallback para mensagem padrão
      console.warn('⚠️ [sendPaidOrder] Usando template padrão');
      message = `🎉 *Pagamento Confirmado - Pedido #{{order_id}}*\n\n✅ Recebemos seu pagamento!\n💰 Valor: *R$ {{total}}*\n\nSeu pedido está sendo preparado para envio.\n\nObrigado pela preferência! 💚`;
    }
    
    // Substituir variáveis do template
    message = replaceTemplateVars(message, {
      order_id: orderId,
      total: totalAmount.toFixed(2)
    });

    console.log('📝 [sendPaidOrder] Mensagem final:', message.substring(0, 100) + '...');

    // Usar endpoint /send do Node.js
    return this.makeRequest('/send', {
      number: normalizeForSending(phone),
      message,
    }, tenantId);
  }

  async getStatus(tenantId?: string): Promise<any> {
    try {
      const serverUrl = tenantId ? await getWhatsAppServerUrl(tenantId) : 'http://localhost:3333';
      const response = await fetch(`${serverUrl}/api/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Erro ao obter status:', error);
      throw error;
    }
  }

  async getLogs(tenantId?: string): Promise<any> {
    try {
      const serverUrl = tenantId ? await getWhatsAppServerUrl(tenantId) : 'http://localhost:3333';
      const response = await fetch(`${serverUrl}/api/logs`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Erro ao obter logs:', error);
      throw error;
    }
  }

  async getMessageStatus(tenantId?: string): Promise<any> {
    try {
      const serverUrl = tenantId ? await getWhatsAppServerUrl(tenantId) : 'http://localhost:3333';
      const response = await fetch(`${serverUrl}/api/message-status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Erro ao obter status das mensagens:', error);
      throw error;
    }
  }
}

export const whatsappService = new WhatsAppService();
export type { WhatsAppResponse, Product, OrderData };