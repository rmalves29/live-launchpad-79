// Servidor WhatsApp Multi-Tenant OTIMIZADO para RAILWAY
// Com suporte a Proxy SOCKS5 e proteção contra bloqueio 405

import express from 'express';
import cors from 'cors';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  delay,
  Browsers
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { Boom } from '@hapi/boom';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', credentials: true }));

// ========== CONFIGURAÇÕES PARA RAILWAY ==========
const PORT = process.env.PORT || 3333;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'baileys_auth_railway');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Configurações de Proxy (se disponível)
const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

// Configurações de proteção contra bloqueio
const MAX_RETRIES = parseInt(process.env.WHATSAPP_MAX_RETRIES || '2');
const RETRY_DELAY = parseInt(process.env.WHATSAPP_RETRY_DELAY || '300000'); // 5 min
const TIMEOUT = parseInt(process.env.WHATSAPP_TIMEOUT || '120000'); // 2 min
const COOLDOWN_ON_405 = parseInt(process.env.WHATSAPP_COOLDOWN_ON_405 || '1800000'); // 30 min

fs.ensureDirSync(AUTH_DIR);

const clients = new Map();
const qrCodes = new Map();
const connectionAttempts = new Map();
const lastError405 = new Map();

// ========== LOGGER MELHORADO ==========
const log = {
  info: (msg, data = '') => console.log(`\x1b[36m[INFO]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  success: (msg, data = '') => console.log(`\x1b[32m[✓]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  warn: (msg, data = '') => console.log(`\x1b[33m[⚠]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  error: (msg, data = '') => console.log(`\x1b[31m[✗]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  qr: (msg) => console.log(`\x1b[35m[QR]\x1b[0m ${new Date().toISOString()} - ${msg}`),
  proxy: (msg) => console.log(`\x1b[34m[PROXY]\x1b[0m ${new Date().toISOString()} - ${msg}`),
};

// ========== CONFIGURAÇÃO DE PROXY ==========
let proxyAgent = null;

if (PROXY_HOST && PROXY_PORT) {
  const proxyUrl = PROXY_USER && PROXY_PASSWORD
    ? `socks5://${PROXY_USER}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`
    : `socks5://${PROXY_HOST}:${PROXY_PORT}`;
  
  proxyAgent = new SocksProxyAgent(proxyUrl);
  log.proxy(`Proxy configurado: ${PROXY_HOST}:${PROXY_PORT}`);
  
  // Testar proxy
  testProxy();
} else {
  log.warn('Proxy NÃO configurado. WhatsApp pode bloquear IP do Railway.');
}

async function testProxy() {
  if (!proxyAgent) return;
  
  try {
    const response = await fetch('https://api.ipify.org?format=json', { 
      agent: proxyAgent,
      timeout: 10000
    });
    const data = await response.json();
    log.success(`Proxy funcionando! IP externo: ${data.ip}`);
  } catch (error) {
    log.error('Erro ao testar proxy:', error.message);
  }
}

// ========== VERIFICAÇÃO DE BLOQUEIO 405 ==========
function isIn405Cooldown(tenantId) {
  const last405 = lastError405.get(tenantId);
  if (!last405) return false;
  
  const timeSince = Date.now() - last405;
  if (timeSince < COOLDOWN_ON_405) {
    const remainingMin = Math.ceil((COOLDOWN_ON_405 - timeSince) / 60000);
    log.warn(`Tenant ${tenantId} em cooldown 405. Aguarde ${remainingMin} minutos.`);
    return true;
  }
  
  return false;
}

function canRetry(tenantId) {
  const attempts = connectionAttempts.get(tenantId) || { count: 0, firstAttempt: Date.now() };
  
  // Reset counter se passou mais de 1 hora
  if (Date.now() - attempts.firstAttempt > 3600000) {
    connectionAttempts.set(tenantId, { count: 0, firstAttempt: Date.now() });
    return true;
  }
  
  if (attempts.count >= MAX_RETRIES) {
    log.warn(`Tenant ${tenantId} atingiu máximo de ${MAX_RETRIES} tentativas.`);
    return false;
  }
  
  return true;
}

function incrementAttempt(tenantId) {
  const attempts = connectionAttempts.get(tenantId) || { count: 0, firstAttempt: Date.now() };
  attempts.count++;
  connectionAttempts.set(tenantId, attempts);
  log.info(`Tentativa ${attempts.count}/${MAX_RETRIES} para tenant ${tenantId}`);
}

// ========== FUNÇÃO DE LOG NO SUPABASE ==========
async function logToSupabase(tenantId, level, message, metadata = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/integration_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        integration_type: 'whatsapp',
        level,
        message,
        metadata: { ...metadata, railway: true, proxy: !!proxyAgent }
      })
    });
  } catch (error) {
    log.error('Erro ao logar no Supabase:', error.message);
  }
}

// ========== CRIAR CLIENTE WHATSAPP ==========
async function createWhatsAppClient(tenantId) {
  log.info(`Criando cliente WhatsApp para tenant: ${tenantId}`);
  
  // Verificar cooldown 405
  if (isIn405Cooldown(tenantId)) {
    throw new Error('Tenant em cooldown devido a erro 405');
  }
  
  // Verificar limite de tentativas
  if (!canRetry(tenantId)) {
    throw new Error(`Limite de ${MAX_RETRIES} tentativas atingido`);
  }
  
  incrementAttempt(tenantId);
  
  const authDir = path.join(AUTH_DIR, tenantId);
  fs.ensureDirSync(authDir);
  
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  
  // Configurações otimizadas para Railway
  const socketConfig = {
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, log),
    },
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: TIMEOUT,
    defaultQueryTimeoutMs: TIMEOUT,
    keepAliveIntervalMs: 30000,
    qrTimeout: 60000,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async () => undefined,
  };
  
  // Adicionar proxy se disponível
  if (proxyAgent) {
    socketConfig.agent = proxyAgent;
    log.proxy(`Cliente ${tenantId} usando proxy`);
  }
  
  const sock = makeWASocket(socketConfig);
  
  // ========== EVENTOS ==========
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      log.qr(`QR Code gerado para tenant: ${tenantId}`);
      
      try {
        const qrDataURL = await QRCode.toDataURL(qr);
        qrCodes.set(tenantId, qrDataURL);
        
        // Salvar QR em arquivo também
        const qrPath = path.join(authDir, 'qrcode.png');
        await QRCode.toFile(qrPath, qr);
        log.success(`QR salvo em: ${qrPath}`);
        
        await logToSupabase(tenantId, 'info', 'QR Code gerado', { hasQR: true });
      } catch (error) {
        log.error('Erro ao gerar QR:', error.message);
      }
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || statusCode;
      
      log.warn(`Conexão fechada para ${tenantId}. Status: ${statusCode}, Razão: ${reason}`);
      
      // Detectar erro 405
      if (statusCode === 405) {
        log.error(`⚠️ ERRO 405 DETECTADO para ${tenantId} - IP BLOQUEADO!`);
        lastError405.set(tenantId, Date.now());
        
        await logToSupabase(tenantId, 'error', 'Erro 405 - IP bloqueado', { 
          statusCode,
          cooldownMinutes: COOLDOWN_ON_405 / 60000 
        });
        
        // Limpar cliente
        clients.delete(tenantId);
        qrCodes.delete(tenantId);
        
        log.warn(`Aguardando ${COOLDOWN_ON_405 / 60000} minutos antes de reconectar...`);
        return;
      }
      
      // Reconectar em outros casos (com delay)
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect && canRetry(tenantId)) {
        log.info(`Aguardando ${RETRY_DELAY / 1000}s antes de reconectar...`);
        
        setTimeout(async () => {
          try {
            await createWhatsAppClient(tenantId);
          } catch (error) {
            log.error(`Erro ao reconectar ${tenantId}:`, error.message);
          }
        }, RETRY_DELAY);
      } else {
        clients.delete(tenantId);
        log.warn(`Cliente ${tenantId} não será reconectado.`);
      }
    }
    
    if (connection === 'open') {
      log.success(`✅ WhatsApp conectado para tenant: ${tenantId}`);
      qrCodes.delete(tenantId);
      connectionAttempts.delete(tenantId);
      
      await logToSupabase(tenantId, 'success', 'WhatsApp conectado', { connected: true });
    }
  });
  
  sock.ev.on('creds.update', saveCreds);
  
  clients.set(tenantId, sock);
  return sock;
}

// ========== ENDPOINTS ==========

// Status geral
app.get('/', (req, res) => {
  const status = {
    server: 'WhatsApp Multi-Tenant Railway Edition',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    proxy: !!proxyAgent,
    proxyConfig: proxyAgent ? `${PROXY_HOST}:${PROXY_PORT}` : 'N/A',
    clients: clients.size,
    tenants: Array.from(clients.keys()),
    config: {
      maxRetries: MAX_RETRIES,
      retryDelay: RETRY_DELAY / 1000 + 's',
      timeout: TIMEOUT / 1000 + 's',
      cooldown405: COOLDOWN_ON_405 / 60000 + ' min'
    }
  };
  res.json(status);
});

// Status de um tenant
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const client = clients.get(tenantId);
  const hasQR = qrCodes.has(tenantId);
  const in405Cooldown = isIn405Cooldown(tenantId);
  const attempts = connectionAttempts.get(tenantId);
  
  res.json({
    tenantId,
    connected: !!client,
    hasQR,
    in405Cooldown,
    attempts: attempts?.count || 0,
    canRetry: canRetry(tenantId)
  });
});

// Obter QR Code
app.get('/qr/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  if (isIn405Cooldown(tenantId)) {
    return res.status(503).json({ 
      error: 'Tenant em cooldown devido a erro 405',
      retryAfterMinutes: Math.ceil((COOLDOWN_ON_405 - (Date.now() - lastError405.get(tenantId))) / 60000)
    });
  }
  
  let client = clients.get(tenantId);
  
  if (!client) {
    try {
      client = await createWhatsAppClient(tenantId);
      
      // Aguardar QR ser gerado (max 60s)
      let waited = 0;
      while (!qrCodes.has(tenantId) && waited < 60000) {
        await delay(1000);
        waited += 1000;
      }
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  const qrDataURL = qrCodes.get(tenantId);
  
  if (qrDataURL) {
    res.json({ qr: qrDataURL, tenantId });
  } else {
    res.status(404).json({ error: 'QR Code não disponível', tenantId });
  }
});

// Forçar nova geração de QR
app.post('/generate-qr/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  if (isIn405Cooldown(tenantId)) {
    return res.status(503).json({ 
      error: 'Tenant em cooldown devido a erro 405',
      message: 'Aguarde o período de cooldown antes de gerar novo QR'
    });
  }
  
  try {
    // Remover cliente existente
    const existingClient = clients.get(tenantId);
    if (existingClient) {
      await existingClient.logout();
      clients.delete(tenantId);
    }
    
    qrCodes.delete(tenantId);
    
    // Criar novo cliente
    await createWhatsAppClient(tenantId);
    
    res.json({ 
      message: 'Gerando novo QR Code',
      tenantId,
      checkAt: `/qr/${tenantId}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset completo
app.post('/reset/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    const client = clients.get(tenantId);
    if (client) {
      await client.logout();
      clients.delete(tenantId);
    }
    
    qrCodes.delete(tenantId);
    connectionAttempts.delete(tenantId);
    lastError405.delete(tenantId);
    
    const authDir = path.join(AUTH_DIR, tenantId);
    if (fs.existsSync(authDir)) {
      fs.removeSync(authDir);
      log.info(`Sessão removida para ${tenantId}`);
    }
    
    res.json({ message: 'Reset completo realizado', tenantId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Limpar cooldown 405 (emergência)
app.post('/clear-cooldown/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  lastError405.delete(tenantId);
  connectionAttempts.delete(tenantId);
  
  res.json({ 
    message: 'Cooldown 405 limpo',
    tenantId,
    warning: 'Use com cautela. WhatsApp pode bloquear novamente.'
  });
});

// Health check para Railway
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ========== INICIAR SERVIDOR ==========
const server = app.listen(PORT, '0.0.0.0', () => {
  log.success(`🚂 Servidor WhatsApp Railway rodando na porta ${PORT}`);
  log.info(`Proxy: ${proxyAgent ? 'ATIVO' : 'INATIVO'}`);
  log.info(`Max tentativas: ${MAX_RETRIES}`);
  log.info(`Delay entre tentativas: ${RETRY_DELAY / 1000}s`);
  log.info(`Cooldown 405: ${COOLDOWN_ON_405 / 60000} min`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.warn('SIGTERM recebido, fechando servidor...');
  
  for (const [tenantId, client] of clients.entries()) {
    try {
      await client.logout();
      log.info(`Cliente ${tenantId} desconectado`);
    } catch (error) {
      log.error(`Erro ao desconectar ${tenantId}:`, error.message);
    }
  }
  
  server.close(() => {
    log.success('Servidor fechado com sucesso');
    process.exit(0);
  });
});

export default app;
