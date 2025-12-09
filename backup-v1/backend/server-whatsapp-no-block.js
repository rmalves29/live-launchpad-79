// Servidor WhatsApp Multi-Tenant - SOLUÇÃO DEFINITIVA ERRO 405
// Previne bloqueio de IP e garante geração do QR Code

import express from 'express';
import cors from 'cors';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  delay
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
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

// Controle de bloqueio global
const blockStatus = {
  isBlocked: false,
  blockedUntil: null,
  blockCount: 0,
};

// Estado dos clientes
const clients = new Map();

// Logger
const log = {
  info: (msg, data = '') => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`, data),
  success: (msg, data = '') => console.log(`\x1b[32m[✓]\x1b[0m ${msg}`, data),
  warn: (msg, data = '') => console.log(`\x1b[33m[⚠]\x1b[0m ${msg}`, data),
  error: (msg, data = '') => console.log(`\x1b[31m[✗]\x1b[0m ${msg}`, data),
  qr: (msg) => console.log(`\x1b[35m[QR]\x1b[0m ${msg}`),
  block: (msg) => console.log(`\x1b[41m\x1b[37m[BLOQUEIO]\x1b[0m ${msg}`),
};

/**
 * Verifica se IP está bloqueado
 */
function isIPBlocked() {
  if (!blockStatus.isBlocked) return false;
  
  if (Date.now() < blockStatus.blockedUntil) {
    const remainingTime = Math.ceil((blockStatus.blockedUntil - Date.now()) / 1000 / 60);
    log.warn(`IP ainda bloqueado. Aguarde ${remainingTime} minutos.`);
    return true;
  }
  
  // Desbloqueio automático
  log.success('Período de bloqueio expirado. IP desbloqueado.');
  blockStatus.isBlocked = false;
  blockStatus.blockedUntil = null;
  return false;
}

/**
 * Marca IP como bloqueado
 */
function markIPAsBlocked() {
  blockStatus.isBlocked = true;
  blockStatus.blockCount++;
  
  // Aumenta tempo de bloqueio progressivamente
  const baseTime = 10; // minutos base
  const multiplier = Math.min(blockStatus.blockCount, 6); // máx 6x
  const blockMinutes = baseTime * multiplier;
  
  blockStatus.blockedUntil = Date.now() + (blockMinutes * 60 * 1000);
  
  log.block(`═══════════════════════════════════════════════════════`);
  log.block(`  IP BLOQUEADO PELO WHATSAPP (Erro 405)`);
  log.block(`  Tentativa de bloqueio: ${blockStatus.blockCount}`);
  log.block(`  Aguardar: ${blockMinutes} minutos`);
  log.block(`  Desbloqueio em: ${new Date(blockStatus.blockedUntil).toLocaleTimeString('pt-BR')}`);
  log.block(`═══════════════════════════════════════════════════════`);
  
  // Desconecta TODOS os clientes para evitar mais bloqueios
  log.warn('Desconectando todos os clientes para prevenir mais bloqueios...');
  for (const [tenantId, clientData] of clients.entries()) {
    try {
      clientData.status = 'blocked';
      if (clientData.sock) {
        clientData.sock.end(undefined);
      }
    } catch (e) {
      // Ignora erros
    }
  }
}

/**
 * Obtém configuração do tenant
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
    log.error(`Erro ao buscar config do tenant:`, error.message);
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
    // Ignora erros de log
  }
}

/**
 * Cria cliente WhatsApp - COM PROTEÇÃO CONTRA BLOQUEIO
 */
async function createClient(tenantId) {
  // VERIFICA BLOQUEIO ANTES DE CONECTAR
  if (isIPBlocked()) {
    const remainingTime = Math.ceil((blockStatus.blockedUntil - Date.now()) / 1000 / 60);
    throw new Error(`IP bloqueado. Aguarde ${remainingTime} minutos antes de tentar novamente.`);
  }

  const config = await getTenantConfig(tenantId);
  if (!config) {
    throw new Error('Tenant não tem integração WhatsApp ativa');
  }

  const sessionDir = path.join(AUTH_DIR, tenantId);
  fs.ensureDirSync(sessionDir);

  log.info(`Iniciando cliente para tenant: ${tenantId}`);

  // Carrega estado de autenticação
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Versão do Baileys
  const { version, isLatest } = await fetchLatestBaileysVersion();
  log.info(`Baileys v${version.join('.')} (latest: ${isLatest})`);

  // CONFIGURAÇÕES OTIMIZADAS PARA EVITAR BLOQUEIO
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, { level: 'silent' }),
    },
    printQRInTerminal: true,
    logger: { level: 'silent' },
    // Configurações de navegador mais "humanas"
    browser: ['OrderZaps', 'Chrome', '110.0.0.0'],
    // Desabilita recursos que podem causar overhead
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    // Timeouts maiores e mais tolerantes
    connectTimeoutMs: 90000, // 90 segundos
    defaultQueryTimeoutMs: 90000,
    keepAliveIntervalMs: 60000, // 1 minuto
    // Configurações para reduzir tráfego
    emitOwnEvents: false,
    fireInitQueries: false,
    // Função para buscar mensagens antigas (retorna vazio)
    getMessage: async () => undefined,
  });

  const clientData = {
    sock,
    status: 'connecting',
    qr: null,
    qrRaw: null,
    lastActivity: Date.now(),
    config,
    attempts: 0,
  };

  clients.set(tenantId, clientData);

  // Evento: QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR GERADO
    if (qr) {
      clientData.attempts++;
      
      log.qr(`╔════════════════════════════════════════════════════════╗`);
      log.qr(`║               QR CODE GERADO                           ║`);
      log.qr(`║  Tenant: ${tenantId.slice(0, 20).padEnd(20)}                         ║`);
      log.qr(`║  Tentativa: ${clientData.attempts}                                       ║`);
      log.qr(`╚════════════════════════════════════════════════════════╝`);
      
      try {
        // Converte para DataURL
        const qrDataUrl = await QRCode.toDataURL(qr, { 
          margin: 2, 
          scale: 10,
          errorCorrectionLevel: 'H',
        });
        
        clientData.qr = qrDataUrl;
        clientData.qrRaw = qr;
        clientData.status = 'qr';
        
        // Salva PNG
        const qrFile = path.join(AUTH_DIR, `${tenantId}_qr_${Date.now()}.png`);
        await QRCode.toFile(qrFile, qr, { scale: 10 });
        
        log.success(`QR Code salvo: ${qrFile}`);
        log.success(`QR Code disponível em: GET /qr/${tenantId}`);
        
      } catch (error) {
        log.error('Erro ao processar QR Code:', error.message);
      }
    }

    // CONEXÃO FECHADA
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom) 
        ? lastDisconnect.error.output?.statusCode 
        : 500;

      const reason = lastDisconnect?.error?.message || 'Desconhecido';
      
      log.warn(`Conexão fechada. Status: ${statusCode}, Motivo: ${reason}`);

      // ERRO 405 - BLOQUEIO DE IP
      if (statusCode === 405) {
        log.error(`ERRO 405 DETECTADO!`);
        
        // Marca IP como bloqueado GLOBALMENTE
        markIPAsBlocked();
        
        // Remove sessão do cliente atual
        clientData.status = 'blocked';
        await fs.remove(sessionDir);
        
        return; // NÃO TENTA RECONECTAR
      }

      // ERRO 401 - Sessão inválida
      if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
        log.error(`Sessão inválida para ${tenantId}`);
        clientData.status = 'auth_failure';
        clients.delete(tenantId);
        await fs.remove(sessionDir);
        return;
      }

      // Outras desconexões - reconecta com cautela
      if (statusCode !== DisconnectReason.loggedOut && clientData.attempts < 2) {
        clientData.status = 'reconnecting';
        
        // Aguarda MAIS TEMPO antes de reconectar (evita bloqueio)
        const waitTime = 15000 + (clientData.attempts * 10000); // 15s, 25s, 35s...
        log.warn(`Aguardando ${waitTime/1000}s antes de reconectar...`);
        
        setTimeout(async () => {
          if (!isIPBlocked()) {
            log.info(`Tentando reconectar ${tenantId}...`);
            clients.delete(tenantId);
            try {
              await createClient(tenantId);
            } catch (error) {
              log.error('Erro ao reconectar:', error.message);
            }
          }
        }, waitTime);
      } else {
        clientData.status = 'disconnected';
      }
    }

    // CONECTANDO
    if (connection === 'connecting') {
      log.info(`Conectando ao WhatsApp... (${tenantId})`);
      clientData.status = 'connecting';
    }

    // CONECTADO
    if (connection === 'open') {
      clientData.status = 'ready';
      clientData.qr = null;
      clientData.qrRaw = null;
      clientData.lastActivity = Date.now();
      clientData.attempts = 0;
      
      // Reseta contador de bloqueios se conectou com sucesso
      if (blockStatus.blockCount > 0) {
        blockStatus.blockCount = Math.max(0, blockStatus.blockCount - 1);
        log.success(`Contador de bloqueios reduzido para: ${blockStatus.blockCount}`);
      }
      
      log.success(`═══════════════════════════════════════════════════════`);
      log.success(`  WhatsApp CONECTADO: ${tenantId.slice(0, 30)}...`);
      log.success(`═══════════════════════════════════════════════════════`);
    }
  });

  // Credenciais atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Mensagens recebidas
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || '';

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
 * Envia mensagem
 */
async function sendMessage(tenantId, phone, message) {
  const clientData = clients.get(tenantId);
  
  if (!clientData || clientData.status !== 'ready') {
    throw new Error(`Cliente não está pronto. Status: ${clientData?.status || 'não existe'}`);
  }

  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

  const result = await clientData.sock.sendMessage(jid, { text: message });
  
  await logMessage(tenantId, {
    phone: phone.replace('@s.whatsapp.net', ''),
    message,
    direction: 'sent',
    status: 'sent',
    timestamp: new Date().toISOString(),
  });

  clientData.lastActivity = Date.now();

  return {
    success: true,
    messageId: result.key.id,
    timestamp: result.messageTimestamp,
  };
}

// ===== ROTAS =====

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'WhatsApp Multi-Tenant API (Anti-Block)',
    version: '3.0.0',
    timestamp: Date.now(),
    blocked: blockStatus.isBlocked,
    blockedUntil: blockStatus.isBlocked ? new Date(blockStatus.blockedUntil).toISOString() : null,
    blockCount: blockStatus.blockCount,
    clients: clients.size,
  });
});

app.get('/status', (req, res) => {
  const statuses = {};
  
  for (const [tenantId, clientData] of clients.entries()) {
    statuses[tenantId] = {
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      lastActivity: clientData.lastActivity,
      attempts: clientData.attempts,
    };
  }

  res.json({
    ok: true,
    blocked: blockStatus.isBlocked,
    blockedUntil: blockStatus.isBlocked ? new Date(blockStatus.blockedUntil).toISOString() : null,
    clients: statuses,
    total: clients.size,
  });
});

app.get('/status/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    if (isIPBlocked()) {
      const remainingTime = Math.ceil((blockStatus.blockedUntil - Date.now()) / 1000 / 60);
      return res.json({
        ok: false,
        blocked: true,
        message: `IP bloqueado. Aguarde ${remainingTime} minutos.`,
        blockedUntil: new Date(blockStatus.blockedUntil).toISOString(),
      });
    }

    let clientData = clients.get(tenantId);
    
    if (!clientData) {
      clientData = await createClient(tenantId);
    }
    
    res.json({
      ok: true,
      tenantId,
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      lastActivity: clientData.lastActivity,
      attempts: clientData.attempts,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get('/qr/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    if (isIPBlocked()) {
      const remainingTime = Math.ceil((blockStatus.blockedUntil - Date.now()) / 1000 / 60);
      return res.json({
        ok: false,
        blocked: true,
        message: `IP bloqueado pelo WhatsApp. Aguarde ${remainingTime} minutos antes de tentar novamente.`,
        blockedUntil: new Date(blockStatus.blockedUntil).toISOString(),
      });
    }

    let clientData = clients.get(tenantId);
    
    if (!clientData) {
      clientData = await createClient(tenantId);
      
      // Aguarda até 45 segundos para gerar QR
      for (let i = 0; i < 45; i++) {
        await delay(1000);
        if (clientData.qr || clientData.status === 'blocked') {
          break;
        }
      }
    }

    if (clientData.status === 'blocked') {
      return res.json({
        ok: false,
        blocked: true,
        message: 'Cliente bloqueado. Use /unblock para desbloquear após o período de espera.',
      });
    }

    if (clientData.qr) {
      res.json({
        ok: true,
        tenantId,
        qr: clientData.qr,
        qrRaw: clientData.qrRaw,
        status: clientData.status,
      });
    } else {
      res.json({
        ok: false,
        message: clientData.status === 'ready' 
          ? 'Cliente já conectado' 
          : 'QR Code não disponível ainda. Tente novamente em alguns segundos.',
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

app.post('/send', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'];
  const { phone, message } = req.body;

  if (!tenantId || !phone || !message) {
    return res.status(400).json({
      ok: false,
      error: 'Parâmetros inválidos',
    });
  }

  try {
    const result = await sendMessage(tenantId, phone, message);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post('/reset/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    if (isIPBlocked()) {
      const remainingTime = Math.ceil((blockStatus.blockedUntil - Date.now()) / 1000 / 60);
      return res.json({
        ok: false,
        blocked: true,
        message: `Não é possível resetar. IP bloqueado por mais ${remainingTime} minutos.`,
      });
    }

    const clientData = clients.get(tenantId);
    if (clientData?.sock) {
      clientData.sock.end(undefined);
    }
    clients.delete(tenantId);

    const sessionDir = path.join(AUTH_DIR, tenantId);
    await fs.remove(sessionDir);

    log.success(`Cliente ${tenantId} resetado`);

    await delay(3000); // Aguarda 3 segundos

    const newClient = await createClient(tenantId);

    res.json({
      ok: true,
      tenantId,
      message: 'Cliente resetado',
      status: newClient.status,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// NOVO: Desbloquear manualmente (use com cautela)
app.post('/unblock', (req, res) => {
  if (!blockStatus.isBlocked) {
    return res.json({
      ok: true,
      message: 'IP não está bloqueado',
    });
  }

  log.warn('Desbloqueio manual solicitado');
  blockStatus.isBlocked = false;
  blockStatus.blockedUntil = null;

  res.json({
    ok: true,
    message: 'IP desbloqueado manualmente. Use com cautela para não ser bloqueado novamente.',
    blockCount: blockStatus.blockCount,
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  log.success(`═══════════════════════════════════════════════════════`);
  log.success(`  Servidor WhatsApp Anti-Block v3.0`);
  log.success(`  Porta: ${PORT}`);
  log.success(`  Auth: ${AUTH_DIR}`);
  log.success(`═══════════════════════════════════════════════════════`);
});

// Limpeza
process.on('SIGINT', async () => {
  log.warn('Encerrando...');
  
  for (const [tenantId, clientData] of clients.entries()) {
    try {
      clientData.sock?.end(undefined);
    } catch (e) {
      // Ignora
    }
  }
  
  process.exit(0);
});
