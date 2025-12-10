/**
 * WhatsApp Multi-Tenant v5.0 STABLE
 * Servidor simplificado para integração com Lovable
 */

import express from 'express';
import cors from 'cors';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_DIR = process.env.AUTH_DIR || '/data/webjs_auth';

// Armazenar sessões em memória
const sessions = new Map();
const qrCodes = new Map();

// Logger
const logger = pino({ level: 'warn' });

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());

// Log de requisições
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// ============================================
// ROTAS v5.0
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'online',
    version: '5.0-stable',
    uptime: Math.floor(process.uptime()),
    memory: {
      heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    tenants: {
      total: sessions.size,
      online: Array.from(sessions.values()).filter(s => s.connected).length
    }
  });
});

// Página inicial
app.get('/', (req, res) => {
  res.json({
    ok: true,
    name: 'WhatsApp Multi-Tenant API',
    version: '5.0-stable',
    routes: {
      'POST /start/:tenantId': 'Inicia sessão e retorna QR code',
      'GET /status/:tenantId': 'Verifica status da conexão',
      'POST /disconnect/:tenantId': 'Desconecta sessão',
      'POST /reset/:tenantId': 'Reseta sessão completamente'
    }
  });
});

// POST /start/:tenantId - Inicia sessão e gera QR code
app.post('/start/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    console.log(`🚀 [${tenantId}] Iniciando sessão...`);
    
    // Se já existe sessão conectada, retornar status
    const existingSession = sessions.get(tenantId);
    if (existingSession?.connected) {
      console.log(`✅ [${tenantId}] Já conectado`);
      return res.json({
        ok: true,
        status: 'connected',
        tenantId,
        message: 'WhatsApp já está conectado'
      });
    }
    
    // Iniciar nova sessão
    const authPath = `${AUTH_DIR}/${tenantId}`;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ['OrderZap', 'Chrome', '120.0.0'],
      connectTimeoutMs: 90000,
      keepAliveIntervalMs: 45000
    });
    
    // Salvar referência da sessão
    sessions.set(tenantId, {
      socket: sock,
      connected: false,
      qrCode: null,
      lastQR: null
    });
    
    // Evento de QR code
    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;
      
      if (qr) {
        console.log(`📱 [${tenantId}] Novo QR code gerado`);
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
        qrCodes.set(tenantId, qrDataUrl);
        
        const session = sessions.get(tenantId);
        if (session) {
          session.qrCode = qrDataUrl;
          session.lastQR = new Date();
        }
      }
      
      if (connection === 'open') {
        console.log(`✅ [${tenantId}] Conectado com sucesso!`);
        const session = sessions.get(tenantId);
        if (session) {
          session.connected = true;
          session.qrCode = null;
        }
        qrCodes.delete(tenantId);
      }
      
      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`❌ [${tenantId}] Desconectado. Razão: ${reason}`);
        
        const session = sessions.get(tenantId);
        if (session) {
          session.connected = false;
        }
        
        // Reconectar se não foi logout manual
        if (reason !== DisconnectReason.loggedOut) {
          console.log(`🔄 [${tenantId}] Tentando reconectar...`);
          // Não reconectar automaticamente para evitar loops
        }
      }
    });
    
    // Salvar credenciais
    sock.ev.on('creds.update', saveCreds);
    
    // Aguardar QR code ser gerado (máximo 15 segundos)
    let attempts = 0;
    while (!qrCodes.has(tenantId) && attempts < 30) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
      
      // Verificar se conectou enquanto esperava
      const session = sessions.get(tenantId);
      if (session?.connected) {
        return res.json({
          ok: true,
          status: 'connected',
          tenantId,
          message: 'WhatsApp conectado com sucesso'
        });
      }
    }
    
    const qrCode = qrCodes.get(tenantId);
    if (qrCode) {
      return res.json({
        ok: true,
        status: 'qr_ready',
        tenantId,
        qrCode,
        message: 'Escaneie o QR code no WhatsApp'
      });
    }
    
    return res.json({
      ok: false,
      status: 'timeout',
      tenantId,
      message: 'Timeout ao gerar QR code. Tente novamente.'
    });
    
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro:`, error.message);
    return res.status(500).json({
      ok: false,
      error: error.message,
      tenantId
    });
  }
});

// GET /status/:tenantId - Verifica status da conexão
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  
  const session = sessions.get(tenantId);
  const qrCode = qrCodes.get(tenantId);
  
  if (!session) {
    return res.json({
      ok: true,
      status: 'not_found',
      connected: false,
      tenantId,
      message: 'Sessão não iniciada'
    });
  }
  
  if (session.connected) {
    return res.json({
      ok: true,
      status: 'connected',
      connected: true,
      tenantId,
      message: 'WhatsApp conectado'
    });
  }
  
  if (qrCode) {
    return res.json({
      ok: true,
      status: 'qr_ready',
      connected: false,
      tenantId,
      qrCode,
      message: 'Aguardando escaneamento do QR code'
    });
  }
  
  return res.json({
    ok: true,
    status: 'disconnected',
    connected: false,
    tenantId,
    message: 'WhatsApp desconectado'
  });
});

// POST /disconnect/:tenantId - Desconecta sessão
app.post('/disconnect/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    const session = sessions.get(tenantId);
    
    if (!session) {
      return res.json({
        ok: true,
        status: 'not_found',
        tenantId,
        message: 'Sessão não encontrada'
      });
    }
    
    if (session.socket) {
      await session.socket.logout();
      session.socket.end();
    }
    
    sessions.delete(tenantId);
    qrCodes.delete(tenantId);
    
    console.log(`🔌 [${tenantId}] Desconectado`);
    
    return res.json({
      ok: true,
      status: 'disconnected',
      tenantId,
      message: 'Sessão desconectada com sucesso'
    });
    
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro ao desconectar:`, error.message);
    
    // Limpar mesmo com erro
    sessions.delete(tenantId);
    qrCodes.delete(tenantId);
    
    return res.json({
      ok: true,
      status: 'disconnected',
      tenantId,
      message: 'Sessão limpa'
    });
  }
});

// POST /reset/:tenantId - Reseta sessão completamente
app.post('/reset/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    console.log(`🔄 [${tenantId}] Resetando sessão...`);
    
    // Desconectar se existir
    const session = sessions.get(tenantId);
    if (session?.socket) {
      try {
        await session.socket.logout();
        session.socket.end();
      } catch (e) {
        // Ignorar erros de logout
      }
    }
    
    sessions.delete(tenantId);
    qrCodes.delete(tenantId);
    
    // Limpar arquivos de auth (opcional - depende do filesystem)
    // await fs.rm(`${AUTH_DIR}/${tenantId}`, { recursive: true, force: true });
    
    console.log(`✅ [${tenantId}] Sessão resetada`);
    
    return res.json({
      ok: true,
      status: 'reset',
      tenantId,
      message: 'Sessão resetada. Use /start para iniciar novamente.'
    });
    
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro ao resetar:`, error.message);
    return res.status(500).json({
      ok: false,
      error: error.message,
      tenantId
    });
  }
});

// ============================================
// ROTA 404
// ============================================
app.use('*', (req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('🚀 WhatsApp Multi-Tenant v5.0 STABLE');
  console.log('='.repeat(60));
  console.log(`✅ Diretório de autenticação: ${AUTH_DIR}`);
  console.log(`✅ Servidor pronto para conexões`);
  console.log(`📁 Auth: ${AUTH_DIR}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`⏱️  Connect timeout: 90s`);
  console.log(`💓 Keepalive: 45s`);
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Encerrando servidor...');
  sessions.forEach((session, tenantId) => {
    if (session.socket) {
      session.socket.end();
    }
  });
  process.exit(0);
});
