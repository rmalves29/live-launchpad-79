// Serviço de Integração com Mercado Pago
// Gerencia pagamentos, preferências e webhooks do Mercado Pago por tenant

import fetch from 'node-fetch';

/**
 * Classe para gerenciar integração com Mercado Pago
 */
export class MercadoPagoService {
  constructor(config) {
    this.accessToken = config.access_token;
    this.publicKey = config.public_key;
    this.isSandbox = config.is_sandbox || false;
    this.baseUrl = this.isSandbox 
      ? 'https://api.mercadopago.com'
      : 'https://api.mercadopago.com';
  }

  /**
   * Valida as credenciais do Mercado Pago
   */
  async validateCredentials() {
    try {
      const response = await fetch(`${this.baseUrl}/v1/payment_methods`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        return {
          valid: true,
          message: 'Credenciais válidas',
        };
      }

      return {
        valid: false,
        message: 'Credenciais inválidas',
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
   * Obtém informações da conta
   */
  async getAccountInfo() {
    try {
      const response = await fetch(`${this.baseUrl}/users/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao obter informações da conta:', error);
      throw error;
    }
  }

  /**
   * Cria uma preferência de pagamento
   */
  async createPaymentPreference(data) {
    const {
      items,
      payer,
      back_urls,
      notification_url,
      external_reference,
      statement_descriptor,
      auto_return = 'approved',
    } = data;

    const preference = {
      items: items.map(item => ({
        title: item.title,
        quantity: item.quantity || 1,
        unit_price: item.unit_price / 100, // converter centavos para reais
        currency_id: 'BRL',
        description: item.description,
      })),
      payer: payer ? {
        name: payer.name,
        surname: payer.surname,
        email: payer.email,
        phone: payer.phone ? {
          area_code: payer.phone.area_code,
          number: payer.phone.number,
        } : undefined,
        identification: payer.document ? {
          type: payer.document.type || 'CPF',
          number: payer.document.number,
        } : undefined,
        address: payer.address ? {
          zip_code: payer.address.postal_code,
          street_name: payer.address.street,
          street_number: payer.address.number,
        } : undefined,
      } : undefined,
      back_urls: back_urls || {
        success: `${process.env.APP_URL}/payment/success`,
        failure: `${process.env.APP_URL}/payment/failure`,
        pending: `${process.env.APP_URL}/payment/pending`,
      },
      auto_return,
      notification_url: notification_url || process.env.MERCADO_PAGO_WEBHOOK_URL,
      external_reference,
      statement_descriptor: statement_descriptor || 'Loja Online',
    };

    try {
      const response = await fetch(`${this.baseUrl}/checkout/preferences`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preference),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao criar preferência de pagamento:', error);
      throw error;
    }
  }

  /**
   * Busca informações de um pagamento
   */
  async getPayment(paymentId) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao buscar pagamento:', error);
      throw error;
    }
  }

  /**
   * Busca informações de uma preferência
   */
  async getPreference(preferenceId) {
    try {
      const response = await fetch(`${this.baseUrl}/checkout/preferences/${preferenceId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao buscar preferência:', error);
      throw error;
    }
  }

  /**
   * Realiza um reembolso total
   */
  async refundPayment(paymentId) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}/refunds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao reembolsar pagamento:', error);
      throw error;
    }
  }

  /**
   * Realiza um reembolso parcial
   */
  async partialRefund(paymentId, amountCents) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}/refunds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountCents / 100, // converter centavos para reais
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao reembolsar parcialmente:', error);
      throw error;
    }
  }

  /**
   * Processa notificação de webhook
   */
  async processWebhook(webhookData) {
    const { type, data } = webhookData;

    if (!data || !data.id) {
      throw new Error('Webhook inválido: dados ausentes');
    }

    // Tipos de notificação do Mercado Pago
    switch (type) {
      case 'payment':
        return await this.getPayment(data.id);
      
      case 'plan':
      case 'subscription':
      case 'invoice':
        // Pode implementar lógica para planos/assinaturas se necessário
        return { type, id: data.id };
      
      default:
        console.warn(`Tipo de webhook não tratado: ${type}`);
        return { type, id: data.id };
    }
  }

  /**
   * Mapeia status do Mercado Pago para status interno
   */
  mapPaymentStatus(mpStatus) {
    const statusMap = {
      'pending': 'pending',
      'approved': 'approved',
      'authorized': 'processing',
      'in_process': 'processing',
      'in_mediation': 'processing',
      'rejected': 'rejected',
      'cancelled': 'cancelled',
      'refunded': 'refunded',
      'charged_back': 'chargeback',
    };

    return statusMap[mpStatus] || 'pending';
  }

  /**
   * Cria link de pagamento direto (PIX, boleto, etc)
   */
  async createPayment(data) {
    const {
      transaction_amount,
      description,
      payment_method_id,
      payer,
      external_reference,
      notification_url,
      installments = 1,
    } = data;

    const payment = {
      transaction_amount: transaction_amount / 100, // converter centavos para reais
      description,
      payment_method_id,
      installments,
      payer: {
        email: payer.email,
        first_name: payer.first_name,
        last_name: payer.last_name,
        identification: payer.document ? {
          type: payer.document.type || 'CPF',
          number: payer.document.number,
        } : undefined,
      },
      external_reference,
      notification_url: notification_url || process.env.MERCADO_PAGO_WEBHOOK_URL,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payment),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao criar pagamento:', error);
      throw error;
    }
  }
}

export default MercadoPagoService;
