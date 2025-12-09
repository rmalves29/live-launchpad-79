/**
 * Serviço de integração com Mercado Pago
 * Gerencia autenticação, validação e operações de pagamento
 */

const axios = require('axios');

class MercadoPagoService {
  constructor() {
    this.sandboxBaseUrl = 'https://api.mercadopago.com';
    this.productionBaseUrl = 'https://api.mercadopago.com';
  }

  /**
   * Obtém a URL base dependendo do ambiente
   */
  getBaseUrl(isSandbox = true) {
    return isSandbox ? this.sandboxBaseUrl : this.productionBaseUrl;
  }

  /**
   * Verifica se o access token é válido
   */
  async verifyCredentials(accessToken, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      const response = await axios.get(`${baseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return {
        success: true,
        message: 'Credenciais válidas',
        data: {
          user_id: response.data.id,
          email: response.data.email,
          nickname: response.data.nickname,
          country_id: response.data.country_id,
        }
      };
    } catch (error) {
      console.error('Erro ao verificar credenciais Mercado Pago:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao verificar credenciais',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Cria uma preferência de pagamento
   */
  async createPaymentPreference(accessToken, data, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      const response = await axios.post(
        `${baseUrl}/checkout/preferences`,
        data,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao criar preferência de pagamento:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao criar preferência de pagamento',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Busca informações de um pagamento
   */
  async getPayment(accessToken, paymentId, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      const response = await axios.get(
        `${baseUrl}/v1/payments/${paymentId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao buscar pagamento:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao buscar pagamento',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Processa um webhook do Mercado Pago
   */
  async processWebhook(webhookData, accessToken, isSandbox = true) {
    try {
      // Tipos de notificação possíveis:
      // - payment: notificação de pagamento
      // - merchant_order: notificação de pedido

      if (webhookData.type === 'payment') {
        const paymentId = webhookData.data?.id;
        if (!paymentId) {
          return {
            success: false,
            message: 'ID de pagamento não fornecido no webhook'
          };
        }

        // Buscar detalhes do pagamento
        const paymentInfo = await this.getPayment(accessToken, paymentId, isSandbox);
        
        return {
          success: true,
          type: 'payment',
          data: paymentInfo.data
        };
      }

      return {
        success: true,
        type: webhookData.type,
        message: 'Webhook processado'
      };
    } catch (error) {
      console.error('Erro ao processar webhook:', error);
      return {
        success: false,
        message: 'Erro ao processar webhook',
        error: error.message
      };
    }
  }

  /**
   * Cria um pagamento PIX
   */
  async createPixPayment(accessToken, data, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      const paymentData = {
        transaction_amount: data.amount,
        description: data.description,
        payment_method_id: 'pix',
        payer: {
          email: data.payer_email,
          first_name: data.payer_name || '',
          identification: data.payer_document ? {
            type: data.payer_document.length === 11 ? 'CPF' : 'CNPJ',
            number: data.payer_document
          } : undefined
        },
        notification_url: data.notification_url,
        external_reference: data.external_reference
      };

      const response = await axios.post(
        `${baseUrl}/v1/payments`,
        paymentData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: {
          id: response.data.id,
          status: response.data.status,
          qr_code: response.data.point_of_interaction?.transaction_data?.qr_code,
          qr_code_base64: response.data.point_of_interaction?.transaction_data?.qr_code_base64,
          ticket_url: response.data.point_of_interaction?.transaction_data?.ticket_url
        }
      };
    } catch (error) {
      console.error('Erro ao criar pagamento PIX:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao criar pagamento PIX',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Busca um pagamento pelo external_reference
   */
  async getPaymentByExternalReference(accessToken, externalReference, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      const response = await axios.get(
        `${baseUrl}/v1/payments/search`,
        {
          params: {
            external_reference: externalReference
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return {
        success: true,
        data: response.data.results || []
      };
    } catch (error) {
      console.error('Erro ao buscar pagamento por referência:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao buscar pagamento',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Estorna um pagamento
   */
  async refundPayment(accessToken, paymentId, amount = null, isSandbox = true) {
    try {
      const baseUrl = this.getBaseUrl(isSandbox);
      const refundData = amount ? { amount } : {};
      
      const response = await axios.post(
        `${baseUrl}/v1/payments/${paymentId}/refunds`,
        refundData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Erro ao estornar pagamento:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Erro ao estornar pagamento',
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = new MercadoPagoService();
