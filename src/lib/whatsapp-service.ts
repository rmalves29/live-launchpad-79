// Serviço para integração com o servidor WhatsApp
import { normalizeForSending } from './phone-utils';
import { supabase } from '@/integrations/supabase/client';

// Função para obter a URL do servidor WhatsApp configurada
async function getWhatsAppServerUrl(tenantId: string): Promise<string> {
  const { data, error } = await supabase
    .from('integration_whatsapp')
    .select('api_url')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();
  
  if (error) {
    throw new Error(`Erro ao buscar configuração WhatsApp: ${error.message}`);
  }
  
  if (!data || !data.api_url) {
    throw new Error('Integração WhatsApp não configurada. Configure a URL da API em Integrações > WhatsApp.');
  }
  
  return data.api_url;
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
      const serverUrl = tenantId ? await getWhatsAppServerUrl(tenantId) : 'http://localhost:3333';
      
      const response = await fetch(`${serverUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || `HTTP ${response.status}`);
        } catch {
          throw new Error(`Erro ao conectar com servidor WhatsApp: ${response.status}. Verifique se a integração está configurada corretamente.`);
        }
      }

      return await response.json();
    } catch (error) {
      console.error(`Erro ao chamar ${endpoint}:`, error);
      throw error;
    }
  }

  async sendItemAdded(orderData: OrderData): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/test/item-added', {
      phone: normalizeForSending(orderData.customer_phone),
      product: orderData.product,
    });
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

  async sendSimpleMessage(phone: string, message: string): Promise<WhatsAppResponse> {
    return this.makeRequest('/send', {
      number: normalizeForSending(phone),
      message,
    });
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