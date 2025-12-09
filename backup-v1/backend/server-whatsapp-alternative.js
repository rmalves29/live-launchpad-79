// Servidor WhatsApp Multi-Tenant - ESTRATÉGIA ALTERNATIVA
// Para quando o IP está persistentemente bloqueado

import express from 'express';
import cors from 'cors';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  delay,
  makeLegacySocket
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { Boom } from '@hapi/boom';
import { createHash } from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', credentials: true }));

// Configurações
const PORT = process.env.PORT || 3333;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'baileys_auth_alt');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

fs.ensureDirSync(AUTH_DIR);

const clients = new Map();

// Logger melhorado
const log = {
  info: (msg, data = '') => console.log(`\x1b[36m[INFO]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`, data),
  success: (msg, data = '') => console.log(`\x1b[32m[✓]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`, data),
  warn: (msg, data = '') => console.log(`\x1b[33m[⚠]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`, data),
  error: (msg, data = '') => console.log(`\x1b[31m[✗]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`, data),
  qr: (msg) => console.log(`\x1b[35m[QR]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`),
};

/**
 * Gera um User Agent único por tenant
 */
function generateUserAgent(tenantId) {
  const hash = createHash('md5').update(tenantId).digest('hex').substring(0, 8);
  const chromeVersions = ['119.0.0.0', '120.0.0.0', '121.0.0.0', '122.0.0.0'];
  const version = chromeVersions[parseInt(hash, 16) % chromeVersions.length];
  
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

/**
 * Gera um nome de browser único
 */
function generateBrowserName(tenantId) {
  const hash = createHash('md5').update(tenantId).digest('hex').substring(0, 6);
  const names = ['OrderZaps', 'ChromeApp', 'WebClient', 'Desktop'];
  const name = names[parseInt(hash, 16) % names.length];
  
  return `${name}-${hash}`;
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
    log.error(`Erro ao buscar config:`, error.message);
    return null;
  }
}

/**
 * Registra mensagem
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
    // Ignora
  }
}

/**
 * Cria cliente com estratégia alternativa
 * ESTA É A MUDANÇA PRINCIPAL!
 */
async function createClient(tenantId) {
  const config = await getTenantConfig(tenantId);
  if (!config) {
    throw new Error('Tenant sem integração WhatsApp ativa');
  }

  const sessionDir = path.join(AUTH_DIR, tenantId);
  fs.ensureDirSync(sessionDir);

  log.info(`═══════════════════════════════════════════════════════`);
  log.info(`Iniciando cliente ALTERNATIVO para: ${tenantId}`);
  log.info(`Estratégia: Browser único + Delays aumentados`);
  log.info(`═══════════════════════════════════════════════════════`);

  // Estado de autenticação
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Versão Baileys
  const { version } = await fetchLatestBaileysVersion();
  log.info(`Baileys v${version.join('.')}`);

  // User Agent e Browser únicos por tenant
  const userAgent = generateUserAgent(tenantId);
  const browserName = generateBrowserName(tenantId);
  
  log.info(`Browser: ${browserName}`);
  log.info(`User Agent: ${userAgent.substring(0, 50)}...`);

  // CONFIGURAÇÕES ALTERNATIVAS - MENOS AGRESSIVAS
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, { level: 'silent' }),
    },
    
    // Logger silencioso
    logger: { level: 'silent' },
    
    // QR no terminal
    printQRInTerminal: true,
    
    // Browser ÚNICO por tenant
    browser: [browserName, 'Chrome', version.join('.')],
    
    // User Agent customizado
    // Nota: Baileys não suporta diretamente, mas o browser name ajuda
    
    // Configurações MUITO conservadoras
    connectTimeoutMs: 120000, // 2 minutos
    defaultQueryTimeoutMs: 120000, // 2 minutos
    keepAliveIntervalMs: 90000, // 1.5 minutos
    
    // Reduzir ao MÍNIMO o tráfego
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    emitOwnEvents: false,
    fireInitQueries: false,
    
    // Não sincronizar nada extra
    shouldSyncHistoryMessage: () => false,
    
    // Função getMessage vazia
    getMessage: async () => undefined,
    
    // Configurações adicionais para reduzir detecção
    cachedGroupMetadata: async () => undefined,
    
    // Retry com delays maiores
    retryRequestDelayMs: 1000, // 1 segundo entre retries
    
    // Máximo de retries reduzido
    maxMsgRetryCount: 2,
  });

  const clientData = {
    sock,
    status: 'connecting',
    qr: null,
    qrRaw: null,
    qrCount: 0,
    lastActivity: Date.now(),
    config,
    browserName,
    userAgent,
  };

  clients.set(tenantId, clientData);

  // Evento: QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR GERADO
    if (qr) {
      clientData.qrCount++;
      
      log.qr(`╔════════════════════════════════════════════════════════╗`);
      log.qr(`║                QR CODE GERADO                          ║`);
      log.qr(`║  Tenant: ${tenantId.slice(0, 30).padEnd(30)}         ║`);
      log.qr(`║  Tentativa: ${clientData.qrCount.toString().padEnd(2)}                                       ║`);
      log.qr(`║  Browser: ${browserName.padEnd(30)}         ║`);
      log.qr(`╚════════════════════════════════════════════════════════╝`);
      
      try {
        // DataURL
        const qrDataUrl = await QRCode.toDataURL(qr, { 
          margin: 3, 
          scale: 12,
          errorCorrectionLevel: 'H',
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        clientData.qr = qrDataUrl;
        clientData.qrRaw = qr;
        clientData.status = 'qr';
        
        // Salvar PNG com timestamp
        const timestamp = Date.now();
        const qrFile = path.join(AUTH_DIR, `qr_${tenantId}_${timestamp}.png`);
        await QRCode.toFile(qrFile, qr, { 
          scale: 12,
          margin: 3,
          errorCorrectionLevel: 'H'
        });
        
        log.success(`QR Code salvo: ${qrFile}`);
        log.success(`Acesse: GET /qr/${tenantId}`);
        
        // Também salvar como texto
        const qrTxtFile = path.join(AUTH_DIR, `qr_${tenantId}_${timestamp}.txt`);
        await fs.writeFile(qrTxtFile, qr);
        log.info(`QR string salvo: ${qrTxtFile}`);
        
      } catch (error) {
        log.error('Erro ao processar QR:', error.message);
      }
    }

    // CONEXÃO FECHADA
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom) 
        ? lastDisconnect.error.output?.statusCode 
        : 500;

      const reason = lastDisconnect?.error?.message || 'Desconhecido';
      
      log.warn(`Conexão fechada. Status: ${statusCode}, Motivo: ${reason}`);

      // ERRO 405 - PARAR TUDO
      if (statusCode === 405) {
        log.error(`═══════════════════════════════════════════════════════`);
        log.error(`  ERRO 405 DETECTADO!`);
        log.error(`  Seu IP AINDA está bloqueado pelo WhatsApp`);
        log.error(`  Soluções:`);
        log.error(`  1. Use um VPN/Proxy`);
        log.error(`  2. Mude seu IP (reinicie roteador)`);
        log.error(`  3. Use outro servidor/máquina`);
        log.error(`  4. Aguarde mais 2-3 horas`);
        log.error(`═══════════════════════════════════════════════════════`);
        
        clientData.status = 'blocked_405';
        await fs.remove(sessionDir);
        
        return; // NÃO reconecta
      }

      // 401 - Sessão inválida
      if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
        log.error(`Sessão inválida`);
        clientData.status = 'auth_failure';
        clients.delete(tenantId);
        await fs.remove(sessionDir);
        return;
      }

      // Outras desconexões - reconecta COM MUITO CUIDADO
      if (statusCode !== DisconnectReason.loggedOut && clientData.qrCount < 3) {
        clientData.status = 'reconnecting';
        
        // Delay MUITO MAIOR (30 segundos base + 20s por tentativa)
        const waitTime = 30000 + (clientData.qrCount * 20000);
        log.warn(`Aguardando ${waitTime/1000}s antes de reconectar...`);
        
        setTimeout(async () => {
          log.info(`Tentando reconectar ${tenantId}...`);
          clients.delete(tenantId);
          try {
            await createClient(tenantId);
          } catch (error) {
            log.error('Erro ao reconectar:', error.message);
          }
        }, waitTime);
      } else {
        clientData.status = 'disconnected';
        log.error(`Máximo de tentativas atingido. Use /reset para tentar novamente.`);
      }
    }

    // CONECTANDO
    if (connection === 'connecting') {
      log.info(`Conectando ao WhatsApp...`);
      clientData.status = 'connecting';
    }

    // CONECTADO
    if (connection === 'open') {
      clientData.status = 'ready';
      clientData.qr = null;
      clientData.qrRaw = null;
      clientData.qrCount = 0;
      clientData.lastActivity = Date.now();
      
      log.success(`═══════════════════════════════════════════════════════`);
      log.success(`  ✓ WhatsApp CONECTADO COM SUCESSO!`);
      log.success(`  Tenant: ${tenantId}`);
      log.success(`  Browser: ${browserName}`);
      log.success(`═══════════════════════════════════════════════════════`);
    }
  });

  // Credenciais
  sock.ev.on('creds.update', saveCreds);

  // Mensagens
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || '';

      log.info(`📨 Mensagem de ${from.split('@')[0]}: ${text.slice(0, 50)}...`);

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

  // Delay antes de enviar (parecer mais humano)
  await delay(500);

  const result = await clientData.sock.sendMessage(jid, { text: message });
  
  await logMessage(tenantId, {
    phone: phone.replace('@s.whatsapp.net', ''),
    message,
    direction: 'sent',
    status: 'sent',
    timestamp: new Date().toISOString(),
  });

  clientData.lastActivity = Date.now();
  log.success(`Mensagem enviada para ${phone}`);

  return {
    success: true,
    messageId: result.key.id,
    timestamp: result.messageTimestamp,
  };
}

// ===== ROTAS =====

app.get('/', (req, res) => {
  const clientList = Array.from(clients.entries()).map(([tid, data]) => ({
    tenant: tid.slice(0, 8) + '...',
    status: data.status,
    browser: data.browserName,
    qrCount: data.qrCount,
  }));

  res.json({
    ok: true,
    service: 'WhatsApp Multi-Tenant API (Alternative Strategy)',
    version: '4.0.0',
    strategy: 'Unique browser per tenant + Increased delays',
    timestamp: Date.now(),
    clients: clientList,
    totalClients: clients.size,
  });
});

app.get('/status', (req, res) => {
  const statuses = {};
  
  for (const [tenantId, clientData] of clients.entries()) {
    statuses[tenantId] = {
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      qrCount: clientData.qrCount,
      browser: clientData.browserName,
      lastActivity: new Date(clientData.lastActivity).toISOString(),
    };
  }

  res.json({
    ok: true,
    clients: statuses,
    total: clients.size,
  });
});

app.get('/status/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    let clientData = clients.get(tenantId);
    
    if (!clientData) {
      log.info(`Criando novo cliente para ${tenantId}...`);
      clientData = await createClient(tenantId);
    }
    
    res.json({
      ok: true,
      tenantId,
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      qrCount: clientData.qrCount,
      browser: clientData.browserName,
      lastActivity: new Date(clientData.lastActivity).toISOString(),
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
    let clientData = clients.get(tenantId);
    
    if (!clientData) {
      log.info(`Criando cliente para obter QR: ${tenantId}`);
      clientData = await createClient(tenantId);
      
      // Aguarda até 60 segundos
      for (let i = 0; i < 60; i++) {
        await delay(1000);
        if (clientData.qr || clientData.status === 'blocked_405') {
          break;
        }
        if (i % 10 === 0) {
          log.info(`Aguardando QR... ${i}s`);
        }
      }
    }

    if (clientData.status === 'blocked_405') {
      return res.status(503).json({
        ok: false,
        error: 'IP ainda está bloqueado (erro 405)',
        message: 'Use VPN, mude IP ou aguarde mais tempo',
        suggestions: [
          'Configure um VPN',
          'Reinicie seu roteador (novo IP)',
          'Use outro servidor/máquina',
          'Aguarde mais 2-3 horas'
        ]
      });
    }

    if (clientData.qr) {
      res.json({
        ok: true,
        tenantId,
        qr: clientData.qr,
        qrRaw: clientData.qrRaw,
        status: clientData.status,
        browser: clientData.browserName,
        qrCount: clientData.qrCount,
      });
    } else {
      res.json({
        ok: false,
        message: clientData.status === 'ready' 
          ? 'Cliente já conectado' 
          : `QR ainda não disponível. Status: ${clientData.status}`,
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
    log.warn(`Resetando cliente ${tenantId}...`);
    
    const clientData = clients.get(tenantId);
    if (clientData?.sock) {
      clientData.sock.end(undefined);
    }
    clients.delete(tenantId);

    const sessionDir = path.join(AUTH_DIR, tenantId);
    await fs.remove(sessionDir);

    log.success(`Cliente resetado`);

    // Aguarda 5 segundos
    await delay(5000);

    const newClient = await createClient(tenantId);

    res.json({
      ok: true,
      tenantId,
      message: 'Cliente resetado com estratégia alternativa',
      status: newClient.status,
      browser: newClient.browserName,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post('/disconnect/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    const clientData = clients.get(tenantId);
    if (clientData?.sock) {
      clientData.sock.end(undefined);
    }
    clients.delete(tenantId);

    log.success(`Cliente desconectado`);

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

// Informações sobre estratégia
app.get('/info', (req, res) => {
  res.json({
    service: 'WhatsApp Alternative Strategy Server',
    version: '4.0.0',
    strategies: {
      uniqueBrowserPerTenant: 'Cada tenant usa um nome de browser único',
      increasedTimeouts: 'Timeouts de 120 segundos (2 minutos)',
      longerDelays: 'Delays de 30-70 segundos entre reconexões',
      reducedTraffic: 'Tráfego mínimo, sem sincronização extra',
      maxRetries: 'Máximo 3 tentativas de QR por sessão',
    },
    whenToUse: 'Quando IP está persistentemente bloqueado (erro 405)',
    alternatives: [
      'Configure VPN no servidor',
      'Mude o IP público (reinicie roteador)',
      'Use proxy SOCKS5',
      'Deploy em outro servidor/região'
    ]
  });
});

// Iniciar
app.listen(PORT, () => {
  log.success(`═══════════════════════════════════════════════════════`);
  log.success(`  WhatsApp Multi-Tenant (ALTERNATIVE STRATEGY)`);
  log.success(`  Versão: 4.0.0`);
  log.success(`  Porta: ${PORT}`);
  log.success(`  Auth Dir: ${AUTH_DIR}`);
  log.success(`═══════════════════════════════════════════════════════`);
  log.info(`Estratégias ativas:`);
  log.info(`- Browser único por tenant`);
  log.info(`- Timeouts aumentados (120s)`);
  log.info(`- Delays maiores (30-70s)`);
  log.info(`- Tráfego reduzido ao mínimo`);
  log.success(`═══════════════════════════════════════════════════════`);
});

// Limpeza
process.on('SIGINT', async () => {
  log.warn('Encerrando...');
  
  for (const [tenantId, clientData] of clients.entries()) {
    try {
      clientData.sock?.end(undefined);
      log.info(`Cliente ${tenantId} desconectado`);
    } catch (e) {
      // Ignora
    }
  }
  
  process.exit(0);
});
