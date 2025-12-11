/**
 * Cliente HTTP para comunicação com o Backend API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          error: data.error || 'Erro na requisição',
          message: data.message,
        };
      }

      return { data };
    } catch (error) {
      return {
        error: 'Erro de conexão com o servidor',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // WhatsApp API - Rotas compatíveis com server-stable.js v5.0
  async startWhatsApp(tenantId: string) {
    return this.request(`/start/${tenantId}`, {
      method: 'POST',
    });
  }

  async getWhatsAppQRCode(tenantId: string) {
    return this.request(`/qr/${tenantId}`);
  }

  async getWhatsAppStatus(tenantId: string) {
    return this.request(`/status/${tenantId}`);
  }

  async disconnectWhatsApp(tenantId: string) {
    return this.request(`/disconnect/${tenantId}`, {
      method: 'POST',
    });
  }

  async resetWhatsApp(tenantId: string) {
    return this.request(`/reset/${tenantId}`, {
      method: 'POST',
    });
  }

  async sendWhatsAppMessage(
    tenantId: string,
    to: string,
    message: string
  ) {
    return this.request('/api/whatsapp/send-message', {
      method: 'POST',
      body: JSON.stringify({ tenantId, to, message }),
    });
  }

  async sendWhatsAppMedia(
    tenantId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType?: 'image' | 'video' | 'document'
  ) {
    return this.request('/api/whatsapp/send-media', {
      method: 'POST',
      body: JSON.stringify({ tenantId, to, mediaUrl, caption, mediaType }),
    });
  }

  async getWhatsAppSessions() {
    return this.request('/api/whatsapp/sessions');
  }

  // Orders API
  async getOrders(tenantId: string, limit = 50, offset = 0) {
    return this.request(`/api/orders/${tenantId}?limit=${limit}&offset=${offset}`);
  }

  async createOrder(orderData: any) {
    return this.request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  }

  async updateOrder(orderId: string, updates: any) {
    return this.request(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }
}

export const apiClient = new ApiClient(API_URL);
export default apiClient;
