// Serviço de Integração com Evolution API
// Substitui Baileys direto por API REST mais estável

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || 'change-me';

class EvolutionWhatsAppService {
  constructor() {
    this.baseUrl = EVOLUTION_URL;
    this.apiKey = API_KEY;
  }

  // Headers padrão
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey
    };
  }

  // Criar instância WhatsApp para um tenant
  async createInstance(tenantId) {
    try {
      const response = await fetch(`${this.baseUrl}/instance/create`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          instanceName: tenantId,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhookUrl: process.env.WEBHOOK_URL || '',
          webhookByEvents: false,
          webhookBase64: true,
          chatwootAccountId: null,
          chatwootToken: null,
          chatwootUrl: null,
          chatwootSignMsg: false,
          chatwootReopenConversation: false,
          chatwootConversationPending: false
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao criar instância');
      }

      console.log(`✅ Instância criada: ${tenantId}`);
      return data;
    } catch (error) {
      console.error(`❌ Erro ao criar instância ${tenantId}:`, error.message);
      throw error;
    }
  }

  // Conectar instância e obter QR Code
  async connectInstance(tenantId) {
    try {
      const response = await fetch(`${this.baseUrl}/instance/connect/${tenantId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao conectar instância');
      }

      console.log(`🔄 Instância conectando: ${tenantId}`);
      return data; // { qrcode: { base64, code }, state: 'connecting' }
    } catch (error) {
      console.error(`❌ Erro ao conectar ${tenantId}:`, error.message);
      throw error;
    }
  }

  // Obter status de conexão
  async getConnectionState(tenantId) {
    try {
      const response = await fetch(`${this.baseUrl}/instance/connectionState/${tenantId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao obter status');
      }

      return data; // { state: 'open' | 'close' | 'connecting' }
    } catch (error) {
      console.error(`❌ Erro ao obter status ${tenantId}:`, error.message);
      return { state: 'close' };
    }
  }

  // Obter QR Code atual
  async getQRCode(tenantId) {
    try {
      const response = await fetch(`${this.baseUrl}/instance/qrcode/${tenantId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      if (!response.ok) {
        return null;
      }

      return data.qrcode; // { base64, code }
    } catch (error) {
      console.error(`⚠️ QR Code não disponível para ${tenantId}`);
      return null;
    }
  }

  // Enviar mensagem de texto
  async sendText(tenantId, number, text) {
    try {
      // Limpar número (remover caracteres não numéricos)
      const cleanNumber = number.replace(/\D/g, '');
      
      const response = await fetch(`${this.baseUrl}/message/sendText/${tenantId}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          number: cleanNumber,
          text: text,
          delay: 1200 // Delay de 1.2s para evitar bloqueio
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao enviar mensagem');
      }

      console.log(`📤 Mensagem enviada: ${tenantId} -> ${cleanNumber}`);
      return data;
    } catch (error) {
      console.error(`❌ Erro ao enviar mensagem:`, error.message);
      throw error;
    }
  }

  // Enviar mensagem com mídia
  async sendMedia(tenantId, number, mediaUrl, caption = '') {
    try {
      const cleanNumber = number.replace(/\D/g, '');
      
      const response = await fetch(`${this.baseUrl}/message/sendMedia/${tenantId}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          number: cleanNumber,
          mediatype: 'image', // image, video, audio, document
          media: mediaUrl,
          caption: caption,
          delay: 1200
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao enviar mídia');
      }

      console.log(`📤 Mídia enviada: ${tenantId} -> ${cleanNumber}`);
      return data;
    } catch (error) {
      console.error(`❌ Erro ao enviar mídia:`, error.message);
      throw error;
    }
  }

  // Logout (desconectar)
  async logout(tenantId) {
    try {
      const response = await fetch(`${this.baseUrl}/instance/logout/${tenantId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      console.log(`🚪 Logout: ${tenantId}`);
      return data;
    } catch (error) {
      console.error(`❌ Erro ao fazer logout ${tenantId}:`, error.message);
      throw error;
    }
  }

  // Deletar instância
  async deleteInstance(tenantId) {
    try {
      const response = await fetch(`${this.baseUrl}/instance/delete/${tenantId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      console.log(`🗑️ Instância deletada: ${tenantId}`);
      return data;
    } catch (error) {
      console.error(`❌ Erro ao deletar instância ${tenantId}:`, error.message);
      throw error;
    }
  }

  // Restart instância
  async restartInstance(tenantId) {
    try {
      const response = await fetch(`${this.baseUrl}/instance/restart/${tenantId}`, {
        method: 'PUT',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      console.log(`🔄 Instância reiniciada: ${tenantId}`);
      return data;
    } catch (error) {
      console.error(`❌ Erro ao reiniciar instância ${tenantId}:`, error.message);
      throw error;
    }
  }

  // Listar todas instâncias
  async listInstances() {
    try {
      const response = await fetch(`${this.baseUrl}/instance/fetchInstances`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      return data; // Array de instâncias
    } catch (error) {
      console.error(`❌ Erro ao listar instâncias:`, error.message);
      return [];
    }
  }

  // Verificar se instância existe
  async instanceExists(tenantId) {
    try {
      const instances = await this.listInstances();
      return instances.some(inst => inst.instance.instanceName === tenantId);
    } catch (error) {
      return false;
    }
  }

  // Garantir que instância exista (criar se não existir)
  async ensureInstance(tenantId) {
    try {
      const exists = await this.instanceExists(tenantId);
      
      if (!exists) {
        console.log(`📝 Criando instância: ${tenantId}`);
        await this.createInstance(tenantId);
      }

      // Obter status
      const state = await this.getConnectionState(tenantId);
      
      // Se não conectado, iniciar conexão
      if (state.state !== 'open') {
        console.log(`🔄 Conectando instância: ${tenantId}`);
        await this.connectInstance(tenantId);
      }

      return true;
    } catch (error) {
      console.error(`❌ Erro ao garantir instância ${tenantId}:`, error.message);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET'
      });

      return response.ok;
    } catch (error) {
      console.error(`❌ Evolution API não está respondendo:`, error.message);
      return false;
    }
  }
}

// Exportar instância única (singleton)
const evolutionService = new EvolutionWhatsAppService();
export default evolutionService;
