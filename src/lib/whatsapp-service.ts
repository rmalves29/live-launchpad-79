// Serviço para integração com o servidor WhatsApp
const WHATSAPP_SERVER_URL = 'http://localhost:3333';

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
  private async makeRequest(endpoint: string, data: any): Promise<WhatsAppResponse> {
    try {
      const response = await fetch(`${WHATSAPP_SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Erro ao chamar ${endpoint}:`, error);
      throw error;
    }
  }

  async sendItemAdded(orderData: OrderData): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/test/item-added', {
      phone: orderData.customer_phone,
      product: orderData.product,
    });
  }

  async sendItemCancelled(orderData: OrderData): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/test/item-cancelled', {
      phone: orderData.customer_phone,
      product: orderData.product,
    });
  }

  async sendOrderCreated(orderData: OrderData): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/test/order-created', {
      phone: orderData.customer_phone,
      customer_name: orderData.customer_name,
      order_id: orderData.order_id,
      total_amount: orderData.total_amount,
    });
  }

  async broadcastByPhones(phones: string[], message: string): Promise<WhatsAppResponse> {
    return this.makeRequest('/api/broadcast/by-phones', {
      key: 'whatsapp-broadcast-2024', // BROADCAST_SECRET
      phones,
      message,
      interval: 2000,
      batchSize: 5,
      batchDelay: 3000,
    });
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
      number: phone,
      message,
    });
  }

  async addLabel(phone: string, label: string): Promise<WhatsAppResponse> {
    return this.makeRequest('/add-label', {
      phone,
      label,
    });
  }

  async getStatus(): Promise<any> {
    try {
      const response = await fetch(`${WHATSAPP_SERVER_URL}/api/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Erro ao obter status:', error);
      throw error;
    }
  }

  async getLogs(): Promise<any> {
    try {
      const response = await fetch(`${WHATSAPP_SERVER_URL}/api/logs`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Erro ao obter logs:', error);
      throw error;
    }
  }

  async getMessageStatus(): Promise<any> {
    try {
      const response = await fetch(`${WHATSAPP_SERVER_URL}/api/message-status`);
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