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
  private async checkServerConnection(serverUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${serverUrl}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5s timeout
      });
      return response.ok;
    } catch (error) {
      console.error('❌ [WS] Servidor não responde:', error);
      return false;
    }
  }

  private async makeRequest(endpoint: string, data: any, tenantId?: string): Promise<WhatsAppResponse> {
    try {
      console.log('🔍 [WS] makeRequest chamado:', { endpoint, tenantId, hasData: !!data });
      
      const serverUrl = tenantId ? await getWhatsAppServerUrl(tenantId) : 'http://localhost:3333';
      
      console.log('🌐 [WS] URL do servidor:', serverUrl);
      
      // Verificar se servidor está online
      const isOnline = await this.checkServerConnection(serverUrl);
      if (!isOnline) {
        throw new Error(`❌ Servidor WhatsApp não está respondendo em ${serverUrl}.\n\n` +
          `💡 Certifique-se de que:\n` +
          `1. O servidor Node.js está rodando (node server-whatsapp-individual-no-env.js)\n` +
          `2. A porta está correta na configuração\n` +
          `3. Não há firewall bloqueando a conexão`);
      }
      
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
          throw new Error(`Erro ao enviar mensagem: ${response.status}. O WhatsApp pode não estar conectado. Verifique o QR Code no servidor Node.js.`);
        }
      }

      const result = await response.json();
      console.log('✅ [WS] Resposta sucesso:', result);
      
      // Verificar se a mensagem foi realmente enviada
      if (!result.success && !result.ok) {
        throw new Error(result.error || 'Falha ao enviar mensagem. Verifique se o WhatsApp está conectado no servidor.');
      }
      
      return result;
    } catch (error) {
      console.error(`❌ [WS] Erro ao chamar ${endpoint}:`, error);
      
      // Melhorar mensagem de erro para o usuário
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`❌ Não foi possível conectar ao servidor WhatsApp.\n\n` +
          `Verifique se o servidor Node.js está rodando e acessível.`);
      }
      
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

    // Montar mensagem formatada
    const message = `🛒 *Item adicionado ao pedido*\n\n✅ ${orderData.product.name}\nQtd: *${orderData.product.qty}*\nValor: *R$ ${orderData.product.price.toFixed(2)}*\n\nDigite *FINALIZAR* para concluir seu pedido.`;

    // Usar endpoint correto /send do Node.js
    return this.makeRequest('/send', {
      number: normalizeForSending(orderData.customer_phone),
      message,
    }, tenantId);
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
    
    // Enviar mensagens via Node.js local
    console.log(`📤 Enviando ${uniquePhones.length} mensagens via Node.js`);
    
    try {
      const response = await fetch('http://localhost:3333/api/broadcast/by-phones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'whatsapp-broadcast-2024',
          phones: uniquePhones.map(phone => normalizeForSending(phone)),
          message,
          interval: 2000,
          batchSize: 5,
          batchDelay: 3000,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Broadcast via Node.js concluído:', result);
      
      return { success: true, total: uniquePhones.length };
    } catch (error) {
      console.error('❌ Erro ao enviar via Node.js:', error);
      throw error;
    }
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
    console.log('📤 [sendProductCanceled] Enviando mensagem de cancelamento:', { 
      phone, 
      productName,
      productCode,
      tenantId 
    });

    // Usar endpoint específico do servidor Node.js
    try {
      const serverUrl = tenantId ? await getWhatsAppServerUrl(tenantId) : 'http://localhost:3333';
      
      const response = await fetch(`${serverUrl}/send-product-canceled`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId || '',
        },
        body: JSON.stringify({
          phone: normalizeForSending(phone),
          product_name: productName,
          product_code: productCode,
          tenant_id: tenantId
        }),
      });

      console.log('📥 [WS] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [WS] Erro na resposta:', errorText);
        throw new Error(`Erro ao enviar mensagem: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ [WS] Resposta sucesso:', result);
      return result;
    } catch (error) {
      console.error('❌ [sendProductCanceled] Erro:', error);
      throw error;
    }
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