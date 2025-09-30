// Serviço para integração com o servidor WhatsApp
import { normalizeForSending } from './phone-utils';
import { supabase } from '@/integrations/supabase/client';

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
      
      const serverUrl = tenantId ? await getWhatsAppServerUrl(tenantId) : 'http://localhost:3333';
      
      console.log('🌐 [WS] URL do servidor:', serverUrl);
      console.log('📤 [WS] Dados a enviar:', JSON.stringify(data, null, 2));
      
      const fullUrl = `${serverUrl}${endpoint}`;
      console.log('🔗 [WS] URL completa:', fullUrl);
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      console.log('📥 [WS] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [WS] Erro na resposta:', errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || `HTTP ${response.status}`);
        } catch {
          throw new Error(`Erro ao conectar com servidor WhatsApp: ${response.status}. Verifique se a integração está configurada corretamente.`);
        }
      }

      const result = await response.json();
      console.log('✅ [WS] Resposta sucesso:', result);
      return result;
    } catch (error) {
      console.error(`❌ [WS] Erro ao chamar ${endpoint}:`, error);
      throw error;
    }
  }

  async sendItemAdded(orderData: OrderData, tenantId: string): Promise<WhatsAppResponse> {
    if (!orderData.product) {
      throw new Error('Product data is required');
    }

    // Buscar template ITEM_ADDED do tenant
    const { data: template } = await supabase
      .from('whatsapp_templates')
      .select('content')
      .eq('tenant_id', tenantId)
      .eq('type', 'ITEM_ADDED')
      .maybeSingle();

    let message = template?.content || 
      `🛒 *Item adicionado ao pedido*\n\n✅ ${orderData.product.name}\nQtd: *${orderData.product.qty}*\nValor: *R$ ${orderData.product.price.toFixed(2)}*\n\nDigite *FINALIZAR* para concluir seu pedido.`;

    // Substituir placeholders
    message = message.replace('{{produto}}', orderData.product.name);
    message = message.replace('{{quantidade}}', orderData.product.qty.toString());
    message = message.replace('{{valor}}', orderData.product.price.toFixed(2));

    // Usar edge function via Supabase
    const { data, error } = await supabase.functions.invoke('whatsapp-send-template', {
      body: {
        tenant_id: tenantId,
        phone: orderData.customer_phone,
        message
      }
    });

    if (error) throw error;
    return data;
  }

  async sendItemCancelled(orderData: OrderData): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/test/item-cancelled', {
      phone: normalizeForSending(orderData.customer_phone),
      product: orderData.product,
    });
  }

  async sendOrderCreated(orderData: OrderData): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/test/order-created', {
      phone: normalizeForSending(orderData.customer_phone),
      customer_name: orderData.customer_name,
      order_id: orderData.order_id,
      total_amount: orderData.total_amount,
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
    
    // Enviar mensagem para cada telefone usando a edge function
    let successCount = 0;
    for (const phone of uniquePhones) {
      try {
        await supabase.functions.invoke('whatsapp-send-template', {
          body: {
            tenant_id: tenantId,
            phone,
            message
          }
        });
        successCount++;
      } catch (error) {
        console.error(`Erro ao enviar para ${phone}:`, error);
      }
    }

    return { success: true, total: successCount };
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