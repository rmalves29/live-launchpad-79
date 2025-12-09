// Serviço de Integração com Melhor Envio
// Gerencia cotações, etiquetas e rastreamento de envios por tenant

import fetch from 'node-fetch';

/**
 * Classe para gerenciar integração com Melhor Envio
 */
export class MelhorEnvioService {
  constructor(config) {
    this.apiToken = config.api_token;
    this.isSandbox = config.is_sandbox || false;
    this.baseUrl = this.isSandbox 
      ? 'https://sandbox.melhorenvio.com.br/api/v2'
      : 'https://melhorenvio.com.br/api/v2';
    this.senderConfig = config.sender_config;
  }

  /**
   * Headers padrão para requisições
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'OrderZaps (contato@orderzaps.com)',
    };
  }

  /**
   * Valida o token da API
   */
  async validateToken() {
    try {
      const response = await fetch(`${this.baseUrl}/me`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          message: 'Token válido',
          user: data,
        };
      }

      return {
        valid: false,
        message: 'Token inválido',
        status: response.status,
      };
    } catch (error) {
      return {
        valid: false,
        message: error.message,
        error,
      };
    }
  }

  /**
   * Obtém saldo da carteira
   */
  async getBalance() {
    try {
      const response = await fetch(`${this.baseUrl}/me/balance`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        balance_cents: Math.round(data.balance * 100),
        balance: data.balance,
      };
    } catch (error) {
      console.error('Erro ao obter saldo:', error);
      throw error;
    }
  }

  /**
   * Calcula frete
   */
  async calculateShipping(data) {
    const { from, to, package: pkg, services } = data;

    const payload = {
      from: {
        postal_code: from.postal_code.replace(/\D/g, ''),
      },
      to: {
        postal_code: to.postal_code.replace(/\D/g, ''),
      },
      package: {
        height: pkg.height,
        width: pkg.width,
        length: pkg.length,
        weight: pkg.weight,
      },
      options: {
        receipt: false,
        own_hand: false,
        insurance_value: 0,
      },
      services: services ? services.join(',') : undefined,
    };

    try {
      const response = await fetch(`${this.baseUrl}/me/shipment/calculate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const quotes = await response.json();
      
      // Mapear para formato padronizado
      return quotes.map(quote => ({
        service_name: quote.name,
        service_code: quote.id.toString(),
        price_cents: Math.round(quote.price * 100),
        delivery_time: quote.delivery_time,
        company: {
          name: quote.company.name,
          picture: quote.company.picture,
        },
        error: quote.error,
      })).filter(quote => !quote.error);
    } catch (error) {
      console.error('Erro ao calcular frete:', error);
      throw error;
    }
  }

  /**
   * Adiciona envio ao carrinho
   */
  async addToCart(data) {
    const { 
      service_code, 
      to_address, 
      package: pkg, 
      declared_value_cents = 0,
      options = {}
    } = data;

    const payload = {
      service: parseInt(service_code),
      agency: null,
      from: {
        name: this.senderConfig.name,
        phone: this.senderConfig.phone,
        email: this.senderConfig.email,
        document: this.senderConfig.document,
        address: this.senderConfig.address.street,
        complement: this.senderConfig.address.complement || '',
        number: this.senderConfig.address.number,
        district: this.senderConfig.address.district,
        city: this.senderConfig.address.city,
        state_abbr: this.senderConfig.address.state,
        country_id: 'BR',
        postal_code: this.senderConfig.address.postal_code.replace(/\D/g, ''),
        note: '',
      },
      to: {
        name: to_address.name || 'Destinatário',
        phone: to_address.phone || '',
        email: to_address.email || '',
        document: to_address.document || '',
        address: to_address.street,
        complement: to_address.complement || '',
        number: to_address.number,
        district: to_address.district,
        city: to_address.city,
        state_abbr: to_address.state,
        country_id: 'BR',
        postal_code: to_address.postal_code.replace(/\D/g, ''),
        note: to_address.note || '',
      },
      products: [{
        name: 'Produto',
        quantity: 1,
        unitary_value: declared_value_cents / 100,
      }],
      volumes: [{
        height: pkg.height,
        width: pkg.width,
        length: pkg.length,
        weight: pkg.weight,
      }],
      options: {
        insurance_value: declared_value_cents / 100,
        receipt: options.receipt || false,
        own_hand: options.own_hand || false,
        reverse: options.reverse || false,
        non_commercial: options.non_commercial || false,
        invoice: options.invoice ? {
          key: options.invoice.key,
        } : null,
        platform: 'OrderZaps',
        tags: options.tags || [],
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/me/cart`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao adicionar ao carrinho:', error);
      throw error;
    }
  }

  /**
   * Finaliza compra do carrinho
   */
  async checkout(orderIds) {
    const payload = {
      orders: Array.isArray(orderIds) ? orderIds : [orderIds],
    };

    try {
      const response = await fetch(`${this.baseUrl}/me/shipment/checkout`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao finalizar compra:', error);
      throw error;
    }
  }

  /**
   * Gera etiquetas
   */
  async generateLabels(orderIds) {
    const payload = {
      orders: Array.isArray(orderIds) ? orderIds : [orderIds],
    };

    try {
      const response = await fetch(`${this.baseUrl}/me/shipment/generate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao gerar etiquetas:', error);
      throw error;
    }
  }

  /**
   * Imprime etiquetas
   */
  async printLabels(orderIds) {
    const payload = {
      mode: 'private',
      orders: Array.isArray(orderIds) ? orderIds : [orderIds],
    };

    try {
      const response = await fetch(`${this.baseUrl}/me/shipment/print`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao imprimir etiquetas:', error);
      throw error;
    }
  }

  /**
   * Rastreia envio
   */
  async trackShipment(orderId) {
    try {
      const response = await fetch(`${this.baseUrl}/me/shipment/tracking/${orderId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao rastrear envio:', error);
      throw error;
    }
  }

  /**
   * Lista envios
   */
  async listShipments(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.status) params.append('status', filters.status);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);

    try {
      const url = `${this.baseUrl}/me/orders?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao listar envios:', error);
      throw error;
    }
  }

  /**
   * Cancela envio
   */
  async cancelShipment(orderId, reason = 'Cancelado pelo usuário') {
    const payload = {
      order: {
        id: orderId,
      },
      reason,
    };

    try {
      const response = await fetch(`${this.baseUrl}/me/shipment/cancel`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao cancelar envio:', error);
      throw error;
    }
  }

  /**
   * Mapeia status do Melhor Envio para status interno
   */
  mapShippingStatus(meStatus) {
    const statusMap = {
      'pending': 'pending',
      'released': 'quoted',
      'paid': 'purchased',
      'posted': 'posted',
      'delivered': 'delivered',
      'canceled': 'cancelled',
      'expired': 'failed',
      'undelivered': 'failed',
    };

    return statusMap[meStatus] || 'pending';
  }

  /**
   * Obtém agências de coleta
   */
  async getAgencies(postalCode, serviceId) {
    try {
      const url = `${this.baseUrl}/me/shipment/agencies?postal_code=${postalCode}&service_id=${serviceId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao obter agências:', error);
      throw error;
    }
  }

  /**
   * Verifica disponibilidade de serviço
   */
  async checkServiceAvailability(serviceId, postalCodeFrom, postalCodeTo) {
    try {
      const payload = {
        from: {
          postal_code: postalCodeFrom.replace(/\D/g, ''),
        },
        to: {
          postal_code: postalCodeTo.replace(/\D/g, ''),
        },
        services: [serviceId],
      };

      const response = await fetch(`${this.baseUrl}/me/shipment/services`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return false;
      }

      const services = await response.json();
      return services.length > 0;
    } catch (error) {
      console.error('Erro ao verificar disponibilidade:', error);
      return false;
    }
  }
}

export default MelhorEnvioService;
