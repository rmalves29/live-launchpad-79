// Servidor WhatsApp Multi-Tenant com Proteção contra Bloqueio de IP
// Resolve problemas de bloqueio temporário do WhatsApp

import express from 'express';
import cors from 'cors';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { Boom } from '@hapi/boom';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', credentials: true }));

// Configurações
const PORT = process.env.PORT || 3333;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'baileys_auth');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

fs.ensureDirSync(AUTH_DIR);

// Logger silencioso para evitar poluição
const logger = pino({ level: 'info' });

// Estado em memória dos clientes WhatsApp
const clients = new Map();

// Controle de tentativas de reconexão para evitar bloqueio
const reconnectAttempts = new Map();
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_COOLDOWN = 60000; // 1 minuto

/**
 * Obtém configuração do tenant do Supabase
 */
async function getTenantConfig(tenantId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/integration_whatsapp?tenant_id=eq.${tenantId}&is_active=eq.true`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  } catch (error) {
    logger.error({ tenantId, error: error.message }, 'Erro ao buscar configuração do tenant');
    return null;
  }
}

/**
 * Registra mensagem no Supabase
 */
async function logMessage(tenantId, data) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        ...data,
      }),
    });
  } catch (error) {
    logger.error({ tenantId, error: error.message }, 'Erro ao registrar mensagem');
  }
}

/**
 * Verifica se pode tentar reconectar (evita bloqueio)
 */
function canReconnect(tenantId) {
  const attempts = reconnectAttempts.get(tenantId);
  
  if (!attempts) {
    reconnectAttempts.set(tenantId, {
      count: 0,
      lastAttempt: Date.now(),
    });
    return true;
  }

  const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
  
  // Reset contador se passou tempo suficiente
  if (timeSinceLastAttempt > RECONNECT_COOLDOWN) {
    reconnectAttempts.set(tenantId, {
      count: 0,
      lastAttempt: Date.now(),
    });
    return true;
  }

  // Verifica limite de tentativas
  if (attempts.count >= MAX_RECONNECT_ATTEMPTS) {
    logger.warn({ tenantId, attempts: attempts.count }, 'Limite de reconexões atingido. Aguardando cooldown.');
    return false;
  }

  return true;
}

/**
 * Incrementa contador de tentativas
 */
function incrementReconnectAttempt(tenantId) {
  const attempts = reconnectAttempts.get(tenantId) || { count: 0, lastAttempt: Date.now() };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  reconnectAttempts.set(tenantId, attempts);
}

/**
 * Reseta contador de tentativas
 */
function resetReconnectAttempts(tenantId) {
  reconnectAttempts.delete(tenantId);
}

/**
 * Cria ou retorna cliente WhatsApp para um tenant
 */
async function ensureClient(tenantId) {
  // Retorna se já existe e está conectado
  if (clients.has(tenantId)) {
    const clientData = clients.get(tenantId);
    if (clientData.status === 'ready') {
      return clientData;
    }
  }

  // Busca configuração do tenant
  const config = await getTenantConfig(tenantId);
  if (!config) {
    throw new Error('Tenant não tem integração WhatsApp ativa');
  }

  const sessionDir = path.join(AUTH_DIR, tenantId);
  fs.ensureDirSync(sessionDir);

  logger.info({ tenantId }, 'Iniciando cliente WhatsApp');

  // Carrega estado de autenticação
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Obtém versão mais recente do Baileys
  const { version } = await fetchLatestBaileysVersion();

  // Configuração otimizada para evitar bloqueio
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    printQRInTerminal: false, // Desabilita impressão no terminal
    logger: pino({ level: 'silent' }), // Logger silencioso
    browser: Browsers.ubuntu('Chrome'), // Identifica como navegador comum
    markOnlineOnConnect: false, // Não marca como online automaticamente
    generateHighQualityLinkPreview: false, // Reduz overhead
    syncFullHistory: false, // Não sincroniza histórico completo
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    // Configurações para reduzir chance de bloqueio
    getMessage: async () => undefined,
  });

  const clientData = {
    sock,
    status: 'connecting',
    qr: null,
    lastActivity: Date.now(),
    config,
    reconnectTimer: null,
  };

  clients.set(tenantId, clientData);

  // Evento: Atualização de conexão
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Code gerado
    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { 
          margin: 1, 
          scale: 8,
          errorCorrectionLevel: 'H'
        });
        clientData.qr = qrDataUrl;
        clientData.status = 'qr';
        logger.info({ tenantId }, '✅ QR Code gerado');
      } catch (error) {
        logger.error({ tenantId, error: error.message }, 'Erro ao gerar QR Code');
      }
    }

    // Conexão fechada
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom) 
        ? lastDisconnect.error.output?.statusCode 
        : 500;

      logger.warn({ 
        tenantId, 
        statusCode,
        reason: lastDisconnect?.error?.message 
      }, 'Conexão fechada');

      // Limpa timer de reconexão anterior
      if (clientData.reconnectTimer) {
        clearTimeout(clientData.reconnectTimer);
      }

      // 401: Sessão inválida - precisa reautenticar
      if (statusCode === 401) {
        logger.error({ tenantId }, '❌ Sessão inválida. Removendo credenciais.');
        clientData.status = 'auth_failure';
        clients.delete(tenantId);
        await fs.remove(sessionDir);
        resetReconnectAttempts(tenantId);
        return;
      }

      // 405: IP bloqueado temporariamente
      if (statusCode === 405) {
        logger.error({ tenantId }, '⚠️ IP bloqueado temporariamente pelo WhatsApp');
        clientData.status = 'blocked';
        
        // Aguarda 5 minutos antes de tentar reconectar
        const cooldownTime = 5 * 60 * 1000; // 5 minutos
        
        logger.info({ tenantId, cooldownMinutes: 5 }, 'Aguardando cooldown para reconexão...');
        
        clientData.reconnectTimer = setTimeout(async () => {
          logger.info({ tenantId }, 'Tentando reconectar após cooldown...');
          clients.delete(tenantId);
          try {
            await ensureClient(tenantId);
          } catch (error) {
            logger.error({ tenantId, error: error.message }, 'Erro ao reconectar');
          }
        }, cooldownTime);
        
        return;
      }

      // Outras desconexões - tenta reconectar com controle
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect && canReconnect(tenantId)) {
        incrementReconnectAttempt(tenantId);
        clientData.status = 'reconnecting';
        
        const attempts = reconnectAttempts.get(tenantId);
        const delay = Math.min(5000 * attempts.count, 30000); // Max 30 segundos
        
        logger.info({ tenantId, attempts: attempts.count, delayMs: delay }, 'Agendando reconexão...');
        
        clientData.reconnectTimer = setTimeout(async () => {
          try {
            clients.delete(tenantId);
            await ensureClient(tenantId);
          } catch (error) {
            logger.error({ tenantId, error: error.message }, 'Erro ao reconectar');
          }
        }, delay);
      } else {
        clientData.status = 'disconnected';
        
        if (!canReconnect(tenantId)) {
          const attempts = reconnectAttempts.get(tenantId);
          const timeRemaining = Math.ceil((RECONNECT_COOLDOWN - (Date.now() - attempts.lastAttempt)) / 1000);
          logger.warn({ 
            tenantId, 
            timeRemaining 
          }, `⏱️ Aguarde ${timeRemaining}s antes de tentar reconectar novamente`);
        }
      }
    }

    // Conectado com sucesso
    if (connection === 'open') {
      clientData.status = 'ready';
      clientData.qr = null;
      clientData.lastActivity = Date.now();
      resetReconnectAttempts(tenantId);
      logger.info({ tenantId }, '✅ WhatsApp conectado e pronto!');
    }
  });

  // Evento: Credenciais atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Evento: Mensagens recebidas
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || '';

      logger.info({ tenantId, from }, '📨 Mensagem recebida');

      // Registra no banco
      await logMessage(tenantId, {
        phone: from.replace('@s.whatsapp.net', ''),
        message: text,
        direction: 'received',
        status: 'received',
        timestamp: new Date(msg.messageTimestamp * 1000).toISOString(),
      });

      clientData.lastActivity = Date.now();
    }
  });

  return clientData;
}

/**
 * Envia mensagem de texto
 */
async function sendMessage(tenantId, phone, message) {
  const clientData = await ensureClient(tenantId);

  if (clientData.status !== 'ready') {
    throw new Error(`Cliente não está pronto. Status: ${clientData.status}`);
  }

  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

  try {
    const result = await clientData.sock.sendMessage(jid, { text: message });
    
    // Registra no banco
    await logMessage(tenantId, {
      phone: phone.replace('@s.whatsapp.net', ''),
      message,
      direction: 'sent',
      status: 'sent',
      timestamp: new Date().toISOString(),
    });

    clientData.lastActivity = Date.now();

    logger.info({ tenantId, phone }, '✅ Mensagem enviada');

    return {
      success: true,
      messageId: result.key.id,
      timestamp: result.messageTimestamp,
    };
  } catch (error) {
    logger.error({ tenantId, phone, error: error.message }, '❌ Erro ao enviar mensagem');
    throw error;
  }
}

// ===== ROTAS =====

// Health check
app.get('/', (req, res) => {
  const activeClients = Array.from(clients.entries()).map(([tenantId, data]) => ({
    tenantId,
    status: data.status,
  }));

  res.json({
    ok: true,
    service: 'WhatsApp Multi-Tenant API (Fixed)',
    version: '2.1.0',
    timestamp: Date.now(),
    clients: activeClients,
    totalClients: clients.size,
  });
});

// Status de todos os clientes
app.get('/status', (req, res) => {
  const statuses = {};
  
  for (const [tenantId, clientData] of clients.entries()) {
    const attempts = reconnectAttempts.get(tenantId);
    
    statuses[tenantId] = {
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      lastActivity: clientData.lastActivity,
      reconnectAttempts: attempts?.count || 0,
      canReconnect: canReconnect(tenantId),
    };
  }

  res.json({
    ok: true,
    clients: statuses,
    total: clients.size,
  });
});

// Status de um tenant específico
app.get('/status/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const clientData = clients.get(tenantId);
    
    if (!clientData) {
      // Tenta criar se não existe
      const newClient = await ensureClient(tenantId);
      
      return res.json({
        ok: true,
        tenantId,
        status: newClient.status,
        hasQR: Boolean(newClient.qr),
        lastActivity: newClient.lastActivity,
      });
    }

    const attempts = reconnectAttempts.get(tenantId);
    
    res.json({
      ok: true,
      tenantId,
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      lastActivity: clientData.lastActivity,
      reconnectAttempts: attempts?.count || 0,
      canReconnect: canReconnect(tenantId),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// Obter QR Code
app.get('/qr/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const clientData = await ensureClient(tenantId);

    if (clientData.qr) {
      res.json({
        ok: true,
        tenantId,
        qr: clientData.qr,
        status: clientData.status,
      });
    } else {
      res.json({
        ok: false,
        message: clientData.status === 'ready' 
          ? 'Cliente já está conectado. QR Code não é necessário.' 
          : clientData.status === 'blocked'
          ? 'IP bloqueado temporariamente. Aguarde alguns minutos.'
          : 'QR Code ainda não foi gerado. Aguarde...',
        status: clientData.status,
      });
    }
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// Enviar mensagem
app.post('/send', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'];
  const { phone, message } = req.body;

  if (!tenantId) {
    return res.status(400).json({
      ok: false,
      error: 'Header X-Tenant-ID é obrigatório',
    });
  }

  if (!phone || !message) {
    return res.status(400).json({
      ok: false,
      error: 'phone e message são obrigatórios',
    });
  }

  try {
    const result = await sendMessage(tenantId, phone, message);
    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// Broadcast (enviar para múltiplos números)
app.post('/broadcast', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'];
  const { phones, message } = req.body;

  if (!tenantId) {
    return res.status(400).json({
      ok: false,
      error: 'Header X-Tenant-ID é obrigatório',
    });
  }

  if (!phones || !Array.isArray(phones) || !message) {
    return res.status(400).json({
      ok: false,
      error: 'phones (array) e message são obrigatórios',
    });
  }

  const results = [];
  const delayBetweenMessages = 2000; // 2 segundos entre mensagens

  for (const phone of phones) {
    try {
      const result = await sendMessage(tenantId, phone, message);
      results.push({ phone, success: true, ...result });
      
      // Aguarda entre mensagens para evitar bloqueio
      await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
    } catch (error) {
      results.push({ phone, success: false, error: error.message });
    }
  }

  res.json({
    ok: true,
    results,
    total: phones.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  });
});

// Resetar cliente (apaga sessão e reconecta)
app.post('/reset/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    // Remove cliente da memória
    const clientData = clients.get(tenantId);
    if (clientData) {
      if (clientData.reconnectTimer) {
        clearTimeout(clientData.reconnectTimer);
      }
      try {
        await clientData.sock?.logout();
      } catch (e) {
        // Ignora erros ao deslogar
      }
    }
    clients.delete(tenantId);

    // Remove sessão do disco
    const sessionDir = path.join(AUTH_DIR, tenantId);
    await fs.remove(sessionDir);

    // Reseta contadores
    resetReconnectAttempts(tenantId);

    logger.info({ tenantId }, '🔄 Cliente resetado');

    // Aguarda 2 segundos antes de reconectar
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Reconecta
    const newClient = await ensureClient(tenantId);

    res.json({
      ok: true,
      tenantId,
      message: 'Cliente resetado com sucesso',
      status: newClient.status,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// Desconectar cliente
app.post('/disconnect/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const clientData = clients.get(tenantId);
    if (clientData) {
      if (clientData.reconnectTimer) {
        clearTimeout(clientData.reconnectTimer);
      }
      try {
        await clientData.sock?.logout();
      } catch (e) {
        // Ignora erros
      }
    }
    clients.delete(tenantId);
    resetReconnectAttempts(tenantId);

    logger.info({ tenantId }, '👋 Cliente desconectado');

    res.json({
      ok: true,
      tenantId,
      message: 'Cliente desconectado',
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  logger.info({ port: PORT, authDir: AUTH_DIR }, '🚀 Servidor WhatsApp Multi-Tenant iniciado (versão com proteção contra bloqueio)');
  console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📁 Diretório de autenticação: ${AUTH_DIR}\n`);
});

// Limpeza ao encerrar
process.on('SIGINT', async () => {
  logger.info('🛑 Encerrando servidor...');
  
  for (const [tenantId, clientData] of clients.entries()) {
    try {
      if (clientData.reconnectTimer) {
        clearTimeout(clientData.reconnectTimer);
      }
      await clientData.sock?.logout();
      logger.info({ tenantId }, 'Cliente desconectado');
    } catch (error) {
      logger.error({ tenantId, error: error.message }, 'Erro ao desconectar cliente');
    }
  }
  
  process.exit(0);
});
