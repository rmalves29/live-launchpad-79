/**
 * WhatsApp Multi-Tenant v5.1 STABLE
 * Servidor com melhorias de resiliência:
 * - Cooldown de 15 minutos após erro 405
 * - Tentativas limitadas de reconexão (máx 3)
 * - Timeouts conservadores
 * - Logging detalhado
 * - Graceful shutdown melhorado
 */

import express from 'express';
import cors from 'cors';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs/promises';

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_DIR = process.env.AUTH_DIR || '/data/webjs_auth';

// Configurações de resiliência
const CONFIG = {
  MAX_RECONNECT_ATTEMPTS: 3,
  COOLDOWN_405_MS: 15 * 60 * 1000, // 15 minutos
  QR_WAIT_TIMEOUT_MS: 20000, // 20 segundos para gerar QR
  CONNECT_TIMEOUT_MS: 60000, // 60 segundos para conectar
  KEEPALIVE_INTERVAL_MS: 30000, // 30 segundos keepalive
  HEALTH_CHECK_INTERVAL_MS: 60000, // 1 minuto para health check interno
};

// Armazenar sessões em memória
const sessions = new Map();
const qrCodes = new Map();
const cooldowns = new Map(); // Armazena cooldowns por tenant

// Logger
const logger = pino({ level: 'warn' });

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());

// Log de requisições com timestamp
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 📥 ${req.method} ${req.path}`);
  next();
});

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

function isInCooldown(tenantId) {
  const cooldownUntil = cooldowns.get(tenantId);
  if (!cooldownUntil) return false;
  
  if (Date.now() < cooldownUntil) {
    const remainingMs = cooldownUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    console.log(`⏳ [${tenantId}] Em cooldown por mais ${remainingMin} minutos`);
    return true;
  }
  
  // Cooldown expirou
  cooldowns.delete(tenantId);
  console.log(`✅ [${tenantId}] Cooldown expirou, liberado para reconexão`);
  return false;
}

function setCooldown(tenantId, durationMs = CONFIG.COOLDOWN_405_MS) {
  const until = Date.now() + durationMs;
  cooldowns.set(tenantId, until);
  const minutes = Math.ceil(durationMs / 60000);
  console.log(`🛑 [${tenantId}] Cooldown ativado por ${minutes} minutos`);
}

function clearCooldown(tenantId) {
  if (cooldowns.has(tenantId)) {
    cooldowns.delete(tenantId);
    console.log(`✅ [${tenantId}] Cooldown removido`);
  }
}

async function cleanupSession(tenantId, deleteFiles = false) {
  console.log(`🧹 [${tenantId}] Limpando sessão...`);
  
  const session = sessions.get(tenantId);
  if (session?.socket) {
    try {
      session.socket.ev.removeAllListeners();
      session.socket.end();
    } catch (e) {
      console.log(`⚠️ [${tenantId}] Erro ao fechar socket: ${e.message}`);
    }
  }
  
  sessions.delete(tenantId);
  qrCodes.delete(tenantId);
  
  if (deleteFiles) {
    try {
      const authPath = `${AUTH_DIR}/${tenantId}`;
      await fs.rm(authPath, { recursive: true, force: true });
      console.log(`🗑️ [${tenantId}] Arquivos de auth removidos`);
    } catch (e) {
      console.log(`⚠️ [${tenantId}] Erro ao remover arquivos: ${e.message}`);
    }
  }
}

// ============================================
// ROTAS v5.1
// ============================================

// Health check detalhado
app.get('/health', (req, res) => {
  const sessionsInfo = {};
  sessions.forEach((session, id) => {
    sessionsInfo[id] = {
      connected: session.connected,
      hasQR: !!qrCodes.get(id),
      reconnectAttempts: session.reconnectAttempts || 0,
      inCooldown: isInCooldown(id)
    };
  });

  res.json({
    ok: true,
    status: 'online',
    version: '5.1-stable',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    config: {
      maxReconnectAttempts: CONFIG.MAX_RECONNECT_ATTEMPTS,
      cooldown405Minutes: CONFIG.COOLDOWN_405_MS / 60000,
      qrWaitTimeoutSeconds: CONFIG.QR_WAIT_TIMEOUT_MS / 1000,
      connectTimeoutSeconds: CONFIG.CONNECT_TIMEOUT_MS / 1000
    },
    memory: {
      heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    tenants: {
      total: sessions.size,
      online: Array.from(sessions.values()).filter(s => s.connected).length,
      inCooldown: cooldowns.size,
      details: sessionsInfo
    }
  });
});

// Página inicial com rotas disponíveis
app.get('/', (req, res) => {
  res.json({
    ok: true,
    name: 'WhatsApp Multi-Tenant API',
    version: '5.1-stable',
    routes: {
      'GET /health': 'Health check detalhado',
      'POST /start/:tenantId': 'Inicia sessão e retorna QR code',
      'GET /status/:tenantId': 'Verifica status da conexão',
      'GET /qr/:tenantId': 'Obtém QR code atual',
      'POST /disconnect/:tenantId': 'Desconecta sessão',
      'POST /reset/:tenantId': 'Reseta sessão completamente'
    }
  });
});

// POST /start/:tenantId - Inicia sessão e gera QR code
app.post('/start/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const timestamp = new Date().toISOString();
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 [${tenantId}] INICIANDO SESSÃO - ${timestamp}`);
    console.log(`${'='.repeat(60)}`);
    
    // Verificar cooldown
    if (isInCooldown(tenantId)) {
      const remainingMs = cooldowns.get(tenantId) - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      
      return res.status(429).json({
        ok: false,
        status: 'cooldown',
        tenantId,
        cooldownMinutes: remainingMin,
        message: `Aguarde ${remainingMin} minutos antes de tentar novamente (proteção anti-ban)`
      });
    }
    
    // Verificar sessão existente
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
    
    // Verificar QR code existente
    const existingQR = qrCodes.get(tenantId);
    if (existingQR && existingSession && !existingSession.connected) {
      console.log(`📱 [${tenantId}] QR code já disponível`);
      return res.json({
        ok: true,
        status: 'qr_ready',
        tenantId,
        qrCode: existingQR,
        message: 'Escaneie o QR code no WhatsApp'
      });
    }
    
    // Limpar sessão antiga se existir
    if (existingSession) {
      await cleanupSession(tenantId);
    }
    
    // Iniciar nova sessão
    console.log(`📁 [${tenantId}] Auth path: ${AUTH_DIR}/${tenantId}`);
    const authPath = `${AUTH_DIR}/${tenantId}`;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ['OrderZap', 'Chrome', '120.0.0'],
      connectTimeoutMs: CONFIG.CONNECT_TIMEOUT_MS,
      keepAliveIntervalMs: CONFIG.KEEPALIVE_INTERVAL_MS,
      retryRequestDelayMs: 2000,
      defaultQueryTimeoutMs: 60000
    });
    
    // Salvar referência da sessão
    const sessionData = {
      socket: sock,
      connected: false,
      qrCode: null,
      lastQR: null,
      reconnectAttempts: 0,
      createdAt: new Date()
    };
    sessions.set(tenantId, sessionData);
    
    // Promise para aguardar QR ou conexão
    const qrPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout aguardando QR code'));
      }, CONFIG.QR_WAIT_TIMEOUT_MS);
      
      sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;
        
        if (qr) {
          clearTimeout(timeout);
          console.log(`📱 [${tenantId}] Novo QR code gerado`);
          
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { 
              width: 300,
              margin: 2,
              errorCorrectionLevel: 'M'
            });
            qrCodes.set(tenantId, qrDataUrl);
            sessionData.qrCode = qrDataUrl;
            sessionData.lastQR = new Date();
            resolve({ type: 'qr', qrCode: qrDataUrl });
          } catch (e) {
            reject(e);
          }
        }
        
        if (connection === 'open') {
          clearTimeout(timeout);
          console.log(`✅ [${tenantId}] Conectado com sucesso!`);
          sessionData.connected = true;
          sessionData.qrCode = null;
          sessionData.reconnectAttempts = 0;
          qrCodes.delete(tenantId);
          clearCooldown(tenantId); // Limpar cooldown após sucesso
          resolve({ type: 'connected' });
        }
        
        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const reason = DisconnectReason[statusCode] || statusCode;
          
          console.log(`❌ [${tenantId}] Desconectado - Código: ${statusCode} (${reason})`);
          sessionData.connected = false;
          
          // Tratar código 405 (conflito/banned)
          if (statusCode === 405 || statusCode === DisconnectReason.connectionReplaced) {
            console.log(`🛑 [${tenantId}] Erro 405 detectado - ativando cooldown`);
            setCooldown(tenantId);
            await cleanupSession(tenantId, true);
            reject(new Error('Erro 405: Conexão bloqueada. Aguarde 15 minutos.'));
            return;
          }
          
          // Logout manual - não reconectar
          if (statusCode === DisconnectReason.loggedOut) {
            console.log(`🔌 [${tenantId}] Logout manual detectado`);
            await cleanupSession(tenantId, true);
            reject(new Error('Logout realizado'));
            return;
          }
          
          // Verificar tentativas de reconexão
          sessionData.reconnectAttempts = (sessionData.reconnectAttempts || 0) + 1;
          
          if (sessionData.reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
            console.log(`🛑 [${tenantId}] Máximo de tentativas atingido (${CONFIG.MAX_RECONNECT_ATTEMPTS})`);
            setCooldown(tenantId, 5 * 60 * 1000); // 5 min cooldown
            reject(new Error(`Falha após ${CONFIG.MAX_RECONNECT_ATTEMPTS} tentativas`));
            return;
          }
        }
      });
    });
    
    // Salvar credenciais
    sock.ev.on('creds.update', saveCreds);
    
    // Aguardar resultado
    try {
      const result = await qrPromise;
      
      if (result.type === 'connected') {
        return res.json({
          ok: true,
          status: 'connected',
          tenantId,
          message: 'WhatsApp conectado com sucesso'
        });
      }
      
      if (result.type === 'qr') {
        return res.json({
          ok: true,
          status: 'qr_ready',
          tenantId,
          qrCode: result.qrCode,
          message: 'Escaneie o QR code no WhatsApp'
        });
      }
    } catch (promiseError) {
      console.error(`❌ [${tenantId}] Erro na promise: ${promiseError.message}`);
      
      // Verificar se é erro 405
      if (promiseError.message.includes('405')) {
        return res.status(429).json({
          ok: false,
          status: 'cooldown',
          tenantId,
          cooldownMinutes: 15,
          error: promiseError.message
        });
      }
      
      throw promiseError;
    }
    
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro fatal:`, error.message);
    
    return res.status(500).json({
      ok: false,
      status: 'error',
      error: error.message,
      tenantId
    });
  }
});

// GET /status/:tenantId - Verifica status da conexão
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  
  // Verificar cooldown
  const inCooldown = isInCooldown(tenantId);
  if (inCooldown) {
    const remainingMs = cooldowns.get(tenantId) - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    
    return res.json({
      ok: true,
      status: 'cooldown',
      connected: false,
      tenantId,
      cooldownMinutes: remainingMin,
      message: `Em cooldown por ${remainingMin} minutos`
    });
  }
  
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
    reconnectAttempts: session.reconnectAttempts || 0,
    message: 'WhatsApp desconectado'
  });
});

// GET /qr/:tenantId - Obtém QR code atual
app.get('/qr/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  
  // Verificar cooldown
  if (isInCooldown(tenantId)) {
    const remainingMs = cooldowns.get(tenantId) - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    
    return res.status(429).json({
      ok: false,
      status: 'cooldown',
      tenantId,
      cooldownMinutes: remainingMin,
      message: `Aguarde ${remainingMin} minutos antes de tentar novamente`
    });
  }
  
  const session = sessions.get(tenantId);
  
  if (session?.connected) {
    return res.json({
      ok: true,
      status: 'connected',
      connected: true,
      tenantId,
      message: 'WhatsApp já está conectado'
    });
  }
  
  const qrCode = qrCodes.get(tenantId);
  
  if (qrCode) {
    return res.json({
      ok: true,
      status: 'qr_ready',
      connected: false,
      tenantId,
      qrCode,
      message: 'QR code disponível'
    });
  }
  
  return res.json({
    ok: true,
    status: 'no_qr',
    connected: false,
    tenantId,
    message: 'Nenhum QR code disponível. Use POST /start para iniciar.'
  });
});

// POST /disconnect/:tenantId - Desconecta sessão
app.post('/disconnect/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    console.log(`🔌 [${tenantId}] Desconectando...`);
    
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
      try {
        await session.socket.logout();
      } catch (e) {
        console.log(`⚠️ [${tenantId}] Erro no logout: ${e.message}`);
      }
    }
    
    await cleanupSession(tenantId, false);
    
    console.log(`✅ [${tenantId}] Desconectado`);
    
    return res.json({
      ok: true,
      status: 'disconnected',
      tenantId,
      message: 'Sessão desconectada com sucesso'
    });
    
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro ao desconectar:`, error.message);
    
    await cleanupSession(tenantId, false);
    
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
  const { clearCooldown: shouldClearCooldown } = req.body || {};
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 [${tenantId}] RESETANDO SESSÃO`);
    console.log(`${'='.repeat(60)}`);
    
    // Opção para limpar cooldown via body
    if (shouldClearCooldown === true) {
      clearCooldown(tenantId);
    }
    
    await cleanupSession(tenantId, true);
    
    console.log(`✅ [${tenantId}] Sessão resetada completamente`);
    
    return res.json({
      ok: true,
      status: 'reset',
      tenantId,
      inCooldown: isInCooldown(tenantId),
      message: 'Sessão resetada. Use POST /start para iniciar novamente.'
    });
    
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro ao resetar:`, error.message);
    return res.status(500).json({
      ok: false,
      status: 'error',
      error: error.message,
      tenantId
    });
  }
});

// POST /clear-cooldown/:tenantId - Limpa cooldown manualmente (admin)
app.post('/clear-cooldown/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  
  clearCooldown(tenantId);
  
  return res.json({
    ok: true,
    tenantId,
    message: 'Cooldown removido'
  });
});

// ============================================
// ROTA 404
// ============================================
app.use('*', (req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method,
    availableRoutes: [
      'GET /',
      'GET /health',
      'POST /start/:tenantId',
      'GET /status/:tenantId',
      'GET /qr/:tenantId',
      'POST /disconnect/:tenantId',
      'POST /reset/:tenantId'
    ]
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 WhatsApp Multi-Tenant v5.1 STABLE');
  console.log('='.repeat(60));
  console.log(`📅 Iniciado em: ${new Date().toISOString()}`);
  console.log(`📁 Auth dir: ${AUTH_DIR}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log('');
  console.log('⚙️ Configurações:');
  console.log(`   - Max reconexões: ${CONFIG.MAX_RECONNECT_ATTEMPTS}`);
  console.log(`   - Cooldown 405: ${CONFIG.COOLDOWN_405_MS / 60000} min`);
  console.log(`   - Timeout QR: ${CONFIG.QR_WAIT_TIMEOUT_MS / 1000}s`);
  console.log(`   - Timeout conexão: ${CONFIG.CONNECT_TIMEOUT_MS / 1000}s`);
  console.log(`   - Keepalive: ${CONFIG.KEEPALIVE_INTERVAL_MS / 1000}s`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown melhorado
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Recebido ${signal} - Encerrando servidor...`);
  
  // Parar de aceitar novas conexões
  server.close(() => {
    console.log('✅ Servidor HTTP fechado');
  });
  
  // Desconectar todas as sessões
  const disconnectPromises = [];
  sessions.forEach((session, tenantId) => {
    console.log(`🔌 Desconectando tenant: ${tenantId}`);
    if (session.socket) {
      disconnectPromises.push(
        new Promise(resolve => {
          try {
            session.socket.ev.removeAllListeners();
            session.socket.end();
          } catch (e) {
            // Ignorar erros
          }
          resolve();
        })
      );
    }
  });
  
  await Promise.allSettled(disconnectPromises);
  
  console.log('✅ Todas as sessões desconectadas');
  console.log('👋 Servidor encerrado com sucesso');
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handler de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});
