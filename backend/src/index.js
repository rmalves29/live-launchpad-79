import express from 'express';
import cors from 'cors';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const AUTH_DIR = process.env.AUTH_DIR || './auth_sessions';

// Garantir que o diretório de sessões existe
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Logger silencioso para Baileys
const logger = pino({ level: 'silent' });

// Armazenamento em memória das sessões
const sessions = new Map();
const qrCodes = new Map();

// ============================================
// GET /status - Health check do backend
// ============================================
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    status: 'running',
    version: '1.0.0',
    activeSessions: sessions.size,
    timestamp: new Date().toISOString()
  });
});

// Alias para health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    version: '1.0.0',
    activeSessions: sessions.size
  });
});

// ============================================
// GET /status/:sessionId - Status de uma sessão
// ============================================
app.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  const qr = qrCodes.get(sessionId);

  if (!session) {
    return res.json({
      ok: true,
      sessionId,
      status: 'disconnected',
      connected: false,
      hasQR: !!qr,
      qr: qr || null
    });
  }

  const isConnected = session.user ? true : false;

  res.json({
    ok: true,
    sessionId,
    status: isConnected ? 'connected' : 'connecting',
    connected: isConnected,
    user: session.user || null,
    hasQR: !!qr,
    qr: isConnected ? null : qr
  });
});

// ============================================
// POST /start/:sessionId - Inicia sessão WhatsApp
// ============================================
app.post('/start/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  // Se já existe sessão conectada, retorna
  if (sessions.has(sessionId)) {
    const existingSession = sessions.get(sessionId);
    if (existingSession.user) {
      return res.json({
        ok: true,
        message: 'Sessão já conectada',
        sessionId,
        status: 'connected',
        user: existingSession.user
      });
    }
  }

  try {
    console.log(`[${sessionId}] Iniciando sessão...`);

    const authPath = path.join(AUTH_DIR, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['OrderZap', 'Chrome', '1.0.0']
    });

    // Evento de atualização de credenciais
    sock.ev.on('creds.update', saveCreds);

    // Evento de conexão
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`[${sessionId}] QR Code gerado`);
        try {
          const qrDataURL = await QRCode.toDataURL(qr);
          qrCodes.set(sessionId, qrDataURL);
        } catch (err) {
          console.error(`[${sessionId}] Erro ao gerar QR:`, err);
        }
      }

      if (connection === 'open') {
        console.log(`[${sessionId}] Conectado!`);
        qrCodes.delete(sessionId);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[${sessionId}] Desconectado. StatusCode: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut) {
          // Limpar sessão se foi logout
          sessions.delete(sessionId);
          qrCodes.delete(sessionId);
          // Remover arquivos de auth
          try {
            fs.rmSync(authPath, { recursive: true, force: true });
          } catch (e) {
            console.error(`[${sessionId}] Erro ao limpar auth:`, e);
          }
        } else if (shouldReconnect) {
          console.log(`[${sessionId}] Tentando reconectar...`);
          // Não reconecta automaticamente - deixa o frontend pedir
        }
      }
    });

    sessions.set(sessionId, sock);

    // Aguarda um pouco para o QR ser gerado
    await new Promise(resolve => setTimeout(resolve, 2000));

    const qr = qrCodes.get(sessionId);
    const isConnected = sock.user ? true : false;

    res.json({
      ok: true,
      message: isConnected ? 'Sessão conectada' : 'Sessão iniciada, aguardando QR scan',
      sessionId,
      status: isConnected ? 'connected' : 'waiting_qr',
      connected: isConnected,
      hasQR: !!qr,
      qr: qr || null,
      user: sock.user || null
    });

  } catch (error) {
    console.error(`[${sessionId}] Erro ao iniciar sessão:`, error);
    res.status(500).json({
      ok: false,
      error: 'Erro ao iniciar sessão',
      message: error.message
    });
  }
});

// ============================================
// POST /stop/:sessionId - Encerra sessão
// ============================================
app.post('/stop/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.json({
      ok: true,
      message: 'Sessão não existe ou já foi encerrada',
      sessionId
    });
  }

  try {
    console.log(`[${sessionId}] Encerrando sessão...`);
    await session.logout();
    sessions.delete(sessionId);
    qrCodes.delete(sessionId);

    // Limpar arquivos de auth
    const authPath = path.join(AUTH_DIR, sessionId);
    try {
      fs.rmSync(authPath, { recursive: true, force: true });
    } catch (e) {
      console.error(`[${sessionId}] Erro ao limpar auth:`, e);
    }

    res.json({
      ok: true,
      message: 'Sessão encerrada com sucesso',
      sessionId
    });

  } catch (error) {
    console.error(`[${sessionId}] Erro ao encerrar sessão:`, error);
    // Mesmo com erro, remove da memória
    sessions.delete(sessionId);
    qrCodes.delete(sessionId);

    res.json({
      ok: true,
      message: 'Sessão removida (com erro no logout)',
      sessionId,
      error: error.message
    });
  }
});

// ============================================
// POST /send-message - Envia mensagem
// ============================================
app.post('/send-message', async (req, res) => {
  const { sessionId, to, message, mediaUrl, mediaType } = req.body;

  if (!sessionId || !to || !message) {
    return res.status(400).json({
      ok: false,
      error: 'Parâmetros obrigatórios: sessionId, to, message'
    });
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      ok: false,
      error: 'Sessão não encontrada',
      sessionId
    });
  }

  if (!session.user) {
    return res.status(400).json({
      ok: false,
      error: 'Sessão não está conectada',
      sessionId
    });
  }

  try {
    // Formatar número para JID do WhatsApp
    const phone = to.replace(/\D/g, '');
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

    console.log(`[${sessionId}] Enviando mensagem para ${jid}`);

    let result;

    if (mediaUrl) {
      // Enviar mídia
      result = await session.sendMessage(jid, {
        image: { url: mediaUrl },
        caption: message
      });
    } else {
      // Enviar texto
      result = await session.sendMessage(jid, { text: message });
    }

    res.json({
      ok: true,
      message: 'Mensagem enviada com sucesso',
      to: jid,
      messageId: result.key.id
    });

  } catch (error) {
    console.error(`[${sessionId}] Erro ao enviar mensagem:`, error);
    res.status(500).json({
      ok: false,
      error: 'Erro ao enviar mensagem',
      message: error.message
    });
  }
});

// ============================================
// GET /qr/:sessionId - Retorna QR code
// ============================================
app.get('/qr/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const qr = qrCodes.get(sessionId);

  if (!qr) {
    return res.json({
      ok: true,
      sessionId,
      hasQR: false,
      qr: null,
      message: 'QR não disponível. Inicie a sessão primeiro.'
    });
  }

  res.json({
    ok: true,
    sessionId,
    hasQR: true,
    qr
  });
});

// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

// ============================================
// Iniciar servidor
// ============================================
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`WhatsApp Baileys Backend v1.0.0`);
  console.log(`Rodando na porta ${PORT}`);
  console.log('='.repeat(50));
  console.log('Rotas disponíveis:');
  console.log('  GET  /status           - Health check');
  console.log('  GET  /status/:id       - Status da sessão');
  console.log('  POST /start/:id        - Iniciar sessão');
  console.log('  POST /stop/:id         - Encerrar sessão');
  console.log('  GET  /qr/:id           - Obter QR code');
  console.log('  POST /send-message     - Enviar mensagem');
  console.log('='.repeat(50));
});
