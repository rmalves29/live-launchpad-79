import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import { setupLogger } from '../config/logger.js';

const logger = setupLogger();
const sessions = new Map();

class WhatsAppService {
  constructor() {
    this.sessionsDir = process.env.WHATSAPP_SESSIONS_PATH || './whatsapp-sessions';
  }

  /**
   * Iniciar nova sessão do WhatsApp
   */
  async startSession(tenantId) {
    if (sessions.has(tenantId)) {
      logger.info(`Sessão já existe para tenant ${tenantId}`);
      return { status: 'already_connected' };
    }

    const sessionPath = path.join(this.sessionsDir, tenantId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      printQRInTerminal: false,
      logger,
      browser: ['OrderZap', 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: true
    });

    // Armazenar QR Code
    let qrCode = null;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrCode = await QRCode.toDataURL(qr);
        logger.info(`QR Code gerado para tenant ${tenantId}`);
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;

        logger.info(`Conexão fechada para tenant ${tenantId}, reconectar: ${shouldReconnect}`);

        if (shouldReconnect) {
          await this.startSession(tenantId);
        } else {
          sessions.delete(tenantId);
        }
      } else if (connection === 'open') {
        logger.info(`✅ WhatsApp conectado para tenant ${tenantId}`);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sessions.set(tenantId, { sock, qrCode });

    return {
      status: 'qr_generated',
      qrCode
    };
  }

  /**
   * Obter QR Code da sessão
   */
  getQRCode(tenantId) {
    const session = sessions.get(tenantId);
    if (!session) {
      return { status: 'not_found' };
    }
    return {
      status: 'ok',
      qrCode: session.qrCode
    };
  }

  /**
   * Verificar status da conexão
   */
  async getStatus(tenantId) {
    const session = sessions.get(tenantId);
    if (!session) {
      return { connected: false };
    }

    try {
      const user = session.sock.user;
      return {
        connected: !!user,
        user: user ? {
          id: user.id,
          name: user.name,
          phone: user.id.split(':')[0]
        } : null
      };
    } catch (error) {
      logger.error(`Erro ao obter status do tenant ${tenantId}:`, error);
      return { connected: false };
    }
  }

  /**
   * Desconectar sessão
   */
  async disconnect(tenantId) {
    const session = sessions.get(tenantId);
    if (!session) {
      return { status: 'not_found' };
    }

    try {
      await session.sock.logout();
      sessions.delete(tenantId);
      logger.info(`Sessão desconectada para tenant ${tenantId}`);
      return { status: 'disconnected' };
    } catch (error) {
      logger.error(`Erro ao desconectar tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Enviar mensagem de texto
   */
  async sendMessage(tenantId, to, message) {
    const session = sessions.get(tenantId);
    if (!session) {
      throw new Error('Sessão não encontrada. Conecte o WhatsApp primeiro.');
    }

    try {
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      const result = await session.sock.sendMessage(jid, { text: message });
      
      logger.info(`Mensagem enviada para ${to} pelo tenant ${tenantId}`);
      
      return {
        status: 'sent',
        messageId: result.key.id,
        to: jid
      };
    } catch (error) {
      logger.error(`Erro ao enviar mensagem para ${to}:`, error);
      throw error;
    }
  }

  /**
   * Enviar mensagem com mídia
   */
  async sendMediaMessage(tenantId, to, mediaUrl, caption, mediaType = 'image') {
    const session = sessions.get(tenantId);
    if (!session) {
      throw new Error('Sessão não encontrada. Conecte o WhatsApp primeiro.');
    }

    try {
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      
      const message = {
        [mediaType]: { url: mediaUrl },
        caption: caption || ''
      };

      const result = await session.sock.sendMessage(jid, message);
      
      logger.info(`Mídia (${mediaType}) enviada para ${to} pelo tenant ${tenantId}`);
      
      return {
        status: 'sent',
        messageId: result.key.id,
        to: jid,
        mediaType
      };
    } catch (error) {
      logger.error(`Erro ao enviar mídia para ${to}:`, error);
      throw error;
    }
  }

  /**
   * Listar todas as sessões ativas
   */
  getAllSessions() {
    return Array.from(sessions.keys());
  }
}

export default new WhatsAppService();
