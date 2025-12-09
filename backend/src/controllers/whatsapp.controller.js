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
   * Obter QR Code da sessão
   */
  async getQRCode(req, res) {
    try {
      const { tenantId } = req.params;

      const result = whatsappService.getQRCode(tenantId);
      
      if (result.status === 'not_found') {
        return res.status(404).json({
          error: 'Sessão não encontrada'
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
