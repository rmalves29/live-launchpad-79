import whatsappService from '../services/whatsapp.service.js';
import { setupLogger } from '../config/logger.js';

const logger = setupLogger();

class WhatsAppController {
  /**
   * POST /api/whatsapp/start
   * Iniciar conexão WhatsApp para um tenant
   */
  async startConnection(req, res) {
    try {
      const { tenantId } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId é obrigatório'
        });
      }

      logger.info(`[WhatsApp] Iniciando conexão para tenant: ${tenantId}`);
      const result = await whatsappService.startSession(tenantId);
      
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
   * GET /api/whatsapp/qrcode/:tenantId
   * Obter QR Code da sessão (auto-inicia se não existir)
   */
  async getQRCode(req, res) {
    try {
      const { tenantId } = req.params;

      logger.info(`[WhatsApp] Buscando QR Code para tenant: ${tenantId}`);

      // Verificar se sessão existe
      let result = whatsappService.getQRCode(tenantId);
      
      // Se não existe, iniciar automaticamente
      if (result.status === 'not_found') {
        logger.info(`[WhatsApp] Sessão não encontrada, iniciando automaticamente...`);
        await whatsappService.startSession(tenantId);
        
        // Aguardar um pouco e tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000));
        result = whatsappService.getQRCode(tenantId);
        
        // Se ainda não tem QR, retornar status de inicialização
        if (!result.qrCode) {
          return res.json({
            status: 'initializing',
            message: 'WhatsApp está sendo inicializado, aguarde alguns segundos...'
          });
        }
      }

      // Verificar se está conectado
      const status = await whatsappService.getStatus(tenantId);
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
   * GET /api/whatsapp/status/:tenantId
   * Verificar status da conexão
   */
  async getStatus(req, res) {
    try {
      const { tenantId } = req.params;

      logger.info(`[WhatsApp] Verificando status para tenant: ${tenantId}`);
      const status = await whatsappService.getStatus(tenantId);
      
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
   * POST /api/whatsapp/disconnect
   * Desconectar sessão
   */
  async disconnect(req, res) {
    try {
      const { tenantId } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId é obrigatório'
        });
      }

      logger.info(`[WhatsApp] Desconectando tenant: ${tenantId}`);
      const result = await whatsappService.disconnect(tenantId);
      
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
   * POST /api/whatsapp/reset
   * Resetar sessão (desconectar e limpar dados)
   */
  async resetSession(req, res) {
    try {
      const { tenantId } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId é obrigatório'
        });
      }

      logger.info(`[WhatsApp] Resetando sessão para tenant: ${tenantId}`);
      
      // Primeiro desconectar
      await whatsappService.disconnect(tenantId);
      
      // Depois iniciar nova sessão
      const result = await whatsappService.startSession(tenantId);
      
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
