/**
 * Serviço de integração com Melhor Envio
 * Gerencia autenticação, cálculo de frete e criação de etiquetas
 */

const axios = require('axios');

class MelhorEnvioService {
  constructor() {
    this.sandboxBaseUrl = 'https://sandbox.melhorenvio.com.br/api/v2';
    this.productionBaseUrl = 'https://melhorenvio.com.br/api/v2';
  }

  /**
   * Obtém a URL base dependendo do ambiente
   */
  getBaseUrl(isSandbox = true) {
    return isSandbox ? this.sandboxBaseUrl : this.productionBaseUrl;
  }

  /**
   * Verifica se o token é válido e retorna informações do usuário
   */
  async verifyCredentials(apiToken, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      const response = await axios.get(`${baseUrl}/me`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json'
        }
      });

      return {
        success: true,
        message: 'Credenciais válidas',
        data: {
          user_id: response.data.id,
          email: response.data.email,
          firstname: response.data.firstname,
          lastname: response.data.lastname,
          balance: response.data.balance || 0
        }
      };
    } catch (error) {
      console.error('Erro ao verificar credenciais Melhor Envio:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao verificar credenciais',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Calcula frete para um endereço
   */
  async calculateShipping(apiToken, data, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      
      const shippingData = {
        from: {
          postal_code: data.from_postal_code
        },
        to: {
          postal_code: data.to_postal_code
        },
        package: {
          weight: data.weight || 0.3, // kg
          width: data.width || 12, // cm
          height: data.height || 4, // cm
          length: data.length || 17 // cm
        },
        options: {
          insurance_value: data.insurance_value || 0,
          receipt: data.receipt || false,
          own_hand: data.own_hand || false
        },
        services: data.services || '1,2,3' // 1=PAC, 2=SEDEX, 3=SEDEX 10
      };

      const response = await axios.post(
        `${baseUrl}/me/shipment/calculate`,
        shippingData,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao calcular frete:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao calcular frete',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Cria um pedido de envio (carrinho)
   */
  async createShippingOrder(apiToken, data, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      
      const orderData = {
        service: data.service_id, // ID do serviço escolhido
        agency: data.agency_id || null,
        from: {
          name: data.from_name,
          phone: data.from_phone,
          email: data.from_email,
          document: data.from_document,
          company_document: data.from_company_document || data.from_document,
          state_register: data.from_state_register || '',
          address: data.from_address,
          complement: data.from_complement || '',
          number: data.from_number,
          district: data.from_district,
          city: data.from_city,
          state_abbr: data.from_state,
          country_id: 'BR',
          postal_code: data.from_postal_code,
          note: data.from_note || ''
        },
        to: {
          name: data.to_name,
          phone: data.to_phone,
          email: data.to_email,
          document: data.to_document,
          company_document: data.to_company_document || data.to_document,
          state_register: data.to_state_register || '',
          address: data.to_address,
          complement: data.to_complement || '',
          number: data.to_number,
          district: data.to_district,
          city: data.to_city,
          state_abbr: data.to_state,
          country_id: 'BR',
          postal_code: data.to_postal_code,
          note: data.to_note || ''
        },
        products: data.products || [{
          name: data.product_name || 'Produto',
          quantity: data.product_quantity || 1,
          unitary_value: data.product_value || 10.00
        }],
        volumes: [{
          height: data.height || 4,
          width: data.width || 12,
          length: data.length || 17,
          weight: data.weight || 0.3
        }],
        options: {
          insurance_value: data.insurance_value || 0,
          receipt: data.receipt || false,
          own_hand: data.own_hand || false,
          reverse: data.reverse || false,
          non_commercial: data.non_commercial || false,
          invoice: data.invoice ? {
            key: data.invoice.key
          } : null,
          platform: data.platform || 'OrderZap',
          tags: data.tags || []
        }
      };

      const response = await axios.post(
        `${baseUrl}/me/cart`,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao criar pedido de envio:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao criar pedido de envio',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Compra/Gera etiqueta de um pedido no carrinho
   */
  async purchaseShipping(apiToken, orderId, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      
      const response = await axios.post(
        `${baseUrl}/me/shipment/checkout`,
        { orders: [orderId] },
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao comprar etiqueta:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao comprar etiqueta',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Gera etiqueta de um pedido comprado
   */
  async generateLabel(apiToken, orderId, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      
      const response = await axios.post(
        `${baseUrl}/me/shipment/generate`,
        { orders: [orderId] },
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao gerar etiqueta:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao gerar etiqueta',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Imprime etiqueta de um pedido
   */
  async printLabel(apiToken, orderId, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      
      const response = await axios.post(
        `${baseUrl}/me/shipment/print`,
        { 
          mode: 'public',
          orders: [orderId] 
        },
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: {
          url: response.data.url
        }
      };
    } catch (error) {
      console.error('Erro ao imprimir etiqueta:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao imprimir etiqueta',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Rastreia um pedido
   */
  async trackShipment(apiToken, trackingCode, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      
      const response = await axios.get(
        `${baseUrl}/me/shipment/tracking`,
        {
          params: {
            orders: trackingCode
          },
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Accept': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao rastrear envio:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao rastrear envio',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Cancela um pedido
   */
  async cancelShipment(apiToken, orderId, description = '', isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      
      const response = await axios.post(
        `${baseUrl}/me/shipment/cancel`,
        { 
          order: {
            id: orderId,
            reason_id: '2', // Desistência da compra
            description: description || 'Cancelado pelo vendedor'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao cancelar envio:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao cancelar envio',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Busca saldo da conta
   */
  async getBalance(apiToken, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      
      const response = await axios.get(
        `${baseUrl}/me/balance`,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Accept': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: {
          balance: response.data.balance || 0
        }
      };
    } catch (error) {
      console.error('Erro ao buscar saldo:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao buscar saldo',
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = new MelhorEnvioService();
