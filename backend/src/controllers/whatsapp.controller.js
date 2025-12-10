import whatsappService from '../services/whatsapp.service.js';
import { setupLogger } from '../config/logger.js';

const logger = setupLogger();

class WhatsAppController {
  /**
   * POST /api/whatsapp/start/:id
   * Iniciar conexão WhatsApp para um tenant
   */
  async startConnection(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          error: 'id é obrigatório'
        });
      }

      logger.info(`[WhatsApp] Iniciando conexão para tenant: ${id}`);
      const result = await whatsappService.startSession(id);
      
      res.json(result);
    } catch (error) {
      logger.error('Erro ao iniciar conexão WhatsApp:', error);
      res.status(500).json({
        error: 'Erro ao iniciar conexão',
        message: error.message
      });
    }
  }

  /**
   * POST /api/whatsapp/start/:id retorna QR code automaticamente
   * Mantido para compatibilidade com código antigo
   */
  async getQRCode(req, res) {
    try {
      const { id } = req.params;

      logger.info(`[WhatsApp] Buscando QR Code para tenant: ${id}`);

      // Verificar se sessão existe
      let result = whatsappService.getQRCode(id);
      
      // Se não existe, iniciar automaticamente
      if (result.status === 'not_found') {
        logger.info(`[WhatsApp] Sessão não encontrada, iniciando automaticamente...`);
        await whatsappService.startSession(id);
        
        // Aguardar um pouco e tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000));
        result = whatsappService.getQRCode(id);
        
        // Se ainda não tem QR, retornar status de inicialização
        if (!result.qrCode) {
          return res.json({
            status: 'initializing',
            message: 'WhatsApp está sendo inicializado, aguarde alguns segundos...'
          });
        }
      }

      // Verificar se está conectado
      const status = await whatsappService.getStatus(id);
      if (status.connected) {
        return res.json({
          status: 'connected',
          connected: true,
          message: 'WhatsApp já está conectado'
        });
      }

      res.json(result);
    } catch (error) {
      logger.error('Erro ao obter QR Code:', error);
      res.status(500).json({
        error: 'Erro ao obter QR Code',
        message: error.message
      });
    }
  }

  /**
   * GET /api/whatsapp/status/:id
   * Verificar status da conexão
   */
  async getStatus(req, res) {
    try {
      const { id } = req.params;

      logger.info(`[WhatsApp] Verificando status para tenant: ${id}`);
      const status = await whatsappService.getStatus(id);
      
      res.json(status);
    } catch (error) {
      logger.error('Erro ao obter status:', error);
      res.status(500).json({
        error: 'Erro ao obter status',
        message: error.message
      });
    }
  }

  /**
   * POST /api/whatsapp/disconnect/:id
   * Desconectar sessão
   */
  async disconnect(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          error: 'id é obrigatório'
        });
      }

      logger.info(`[WhatsApp] Desconectando tenant: ${id}`);
      const result = await whatsappService.disconnect(id);
      
      res.json(result);
    } catch (error) {
      logger.error('Erro ao desconectar:', error);
      res.status(500).json({
        error: 'Erro ao desconectar',
        message: error.message
      });
    }
  }

  /**
   * POST /api/whatsapp/reset/:id
   * Resetar sessão (desconectar e limpar dados)
   */
  async resetSession(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          error: 'id é obrigatório'
        });
      }

      logger.info(`[WhatsApp] Resetando sessão para tenant: ${id}`);
      
      // Primeiro desconectar
      await whatsappService.disconnect(id);
      
      // Depois iniciar nova sessão
      const result = await whatsappService.startSession(id);
      
      res.json({
        status: 'reset_complete',
        message: 'Sessão resetada. Novo QR Code será gerado.',
        ...result
      });
    } catch (error) {
      logger.error('Erro ao resetar sessão:', error);
      res.status(500).json({
        error: 'Erro ao resetar sessão',
        message: error.message
      });
    }
  }

  /**
   * POST /api/whatsapp/send-message
   * Enviar mensagem de texto
   */
  async sendMessage(req, res) {
    try {
      const { tenantId, to, message } = req.body;

      if (!tenantId || !to || !message) {
        return res.status(400).json({
          error: 'tenantId, to e message são obrigatórios'
        });
      }

      const result = await whatsappService.sendMessage(tenantId, to, message);
      
      res.json(result);
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
      res.status(500).json({
        error: 'Erro ao enviar mensagem',
        message: error.message
      });
    }
  }

  /**
   * POST /api/whatsapp/send-media
   * Enviar mensagem com mídia
   */
  async sendMedia(req, res) {
    try {
      const { tenantId, to, mediaUrl, caption, mediaType } = req.body;

      if (!tenantId || !to || !mediaUrl) {
        return res.status(400).json({
          error: 'tenantId, to e mediaUrl são obrigatórios'
        });
      }

      const result = await whatsappService.sendMediaMessage(
        tenantId,
        to,
        mediaUrl,
        caption,
        mediaType || 'image'
      );
      
      res.json(result);
    } catch (error) {
      logger.error('Erro ao enviar mídia:', error);
      res.status(500).json({
        error: 'Erro ao enviar mídia',
        message: error.message
      });
    }
  }

  /**
   * GET /api/whatsapp/sessions
   * Listar todas as sessões ativas
   */
  async getSessions(req, res) {
    try {
      const sessions = whatsappService.getAllSessions();
      
      res.json({
        total: sessions.length,
        sessions
      });
    } catch (error) {
      logger.error('Erro ao listar sessões:', error);
      res.status(500).json({
        error: 'Erro ao listar sessões',
        message: error.message
      });
    }
  }
}

export default new WhatsAppController();
