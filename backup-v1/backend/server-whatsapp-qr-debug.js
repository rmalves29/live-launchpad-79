// Servidor WhatsApp Multi-Tenant - Debug QR Code
// Versão simplificada para garantir geração do QR Code

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

// Estado em memória dos clientes WhatsApp
const clients = new Map();

// Log colorido no console
const log = {
  info: (msg, data = '') => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`, data),
  success: (msg, data = '') => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`, data),
  warn: (msg, data = '') => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`, data),
  error: (msg, data = '') => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`, data),
  qr: (msg) => console.log(`\x1b[35m[QR CODE]\x1b[0m ${msg}`),
};

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
    log.error(`Erro ao buscar configuração do tenant ${tenantId}:`, error.message);
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
    log.error(`Erro ao registrar mensagem:`, error.message);
  }
}

/**
 * Cria ou retorna cliente WhatsApp para um tenant
 */
async function ensureClient(tenantId, forceNew = false) {
  // Se já existe e não é força nova conexão, retorna
  if (!forceNew && clients.has(tenantId)) {
    const clientData = clients.get(tenantId);
    if (clientData.status === 'ready') {
      log.info(`Cliente ${tenantId} já está conectado`);
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

  log.info(`Iniciando cliente WhatsApp para tenant: ${tenantId}`);

  // Carrega estado de autenticação
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Obtém versão mais recente do Baileys
  const { version, isLatest } = await fetchLatestBaileysVersion();
  log.info(`Usando Baileys versão ${version.join('.')} (latest: ${isLatest})`);

  // Cria socket WhatsApp
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, { level: 'silent' }),
    },
    printQRInTerminal: true, // FORÇAR impressão do QR no terminal
    logger: { level: 'silent' },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    getMessage: async () => undefined,
  });

  const clientData = {
    sock,
    status: 'connecting',
    qr: null,
    qrString: null, // String raw do QR
    lastActivity: Date.now(),
    config,
    connectionAttempts: 0,
  };

  clients.set(tenantId, clientData);

  // Evento: QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Code gerado
    if (qr) {
      clientData.connectionAttempts++;
      log.qr(`╔════════════════════════════════════════╗`);
      log.qr(`║  QR CODE GERADO PARA: ${tenantId.slice(0, 8)}...  ║`);
      log.qr(`║  Tentativa: ${clientData.connectionAttempts}                        ║`);
      log.qr(`╚════════════════════════════════════════╝`);
      
      try {
        // Gerar DataURL
        const qrDataUrl = await QRCode.toDataURL(qr, { 
          margin: 2, 
          scale: 8,
          errorCorrectionLevel: 'H',
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        clientData.qr = qrDataUrl;
        clientData.qrString = qr;
        clientData.status = 'qr';
        
        log.success(`QR Code convertido para DataURL com sucesso!`);
        log.info(`QR Code disponível em: GET /qr/${tenantId}`);
        
        // Salvar QR como PNG para debug
        const qrPngPath = path.join(AUTH_DIR, `${tenantId}_qr.png`);
        await QRCode.toFile(qrPngPath, qr, { scale: 8 });
        log.success(`QR Code salvo em: ${qrPngPath}`);
        
      } catch (error) {
        log.error('Erro ao gerar QR Code:', error.message);
        log.error(error.stack);
      }
    }

    // Conexão fechada
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom) 
        ? lastDisconnect.error.output?.statusCode 
        : 500;

      log.warn(`Conexão fechada para ${tenantId}. Status: ${statusCode}`);

      // 401: Sessão inválida
      if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
        log.error(`Sessão inválida para ${tenantId}. Limpando...`);
        clientData.status = 'auth_failure';
        clients.delete(tenantId);
        await fs.remove(sessionDir);
        return;
      }

      // 405: IP bloqueado
      if (statusCode === 405) {
        log.warn(`IP bloqueado para ${tenantId}. Aguardando 5 minutos...`);
        clientData.status = 'blocked';
        
        setTimeout(async () => {
          log.info(`Tentando reconectar ${tenantId} após cooldown...`);
          clients.delete(tenantId);
          try {
            await ensureClient(tenantId, true);
          } catch (error) {
            log.error('Erro ao reconectar:', error.message);
          }
        }, 5 * 60 * 1000);
        
        return;
      }

      // Outras desconexões
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      if (shouldReconnect && clientData.connectionAttempts < 3) {
        clientData.status = 'reconnecting';
        log.info(`Reconectando ${tenantId} em 5 segundos... (tentativa ${clientData.connectionAttempts + 1}/3)`);
        
        setTimeout(async () => {
          try {
            clients.delete(tenantId);
            await ensureClient(tenantId, true);
          } catch (error) {
            log.error('Erro ao reconectar:', error.message);
          }
        }, 5000);
      } else {
        clientData.status = 'disconnected';
        log.warn(`Desconectado ${tenantId}. Use /reset para tentar novamente.`);
      }
    }

    // Conectando
    if (connection === 'connecting') {
      log.info(`Conectando ao WhatsApp... (${tenantId})`);
      clientData.status = 'connecting';
    }

    // Conectado com sucesso
    if (connection === 'open') {
      clientData.status = 'ready';
      clientData.qr = null;
      clientData.qrString = null;
      clientData.lastActivity = Date.now();
      clientData.connectionAttempts = 0;
      
      log.success(`═══════════════════════════════════════`);
      log.success(`  WhatsApp CONECTADO: ${tenantId.slice(0, 8)}...`);
      log.success(`═══════════════════════════════════════`);
    }
  });

  // Evento: Credenciais atualizadas
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    log.info(`Credenciais atualizadas para ${tenantId}`);
  });

  // Evento: Mensagens recebidas
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || '';

      log.info(`Mensagem recebida de ${from}: ${text.slice(0, 50)}...`);

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
    log.success(`Mensagem enviada para ${phone}`);

    return {
      success: true,
      messageId: result.key.id,
      timestamp: result.messageTimestamp,
    };
  } catch (error) {
    log.error(`Erro ao enviar mensagem para ${phone}:`, error.message);
    throw error;
  }
}

// ===== ROTAS =====

// Health check
app.get('/', (req, res) => {
  const activeClients = Array.from(clients.entries()).map(([tenantId, data]) => ({
    tenantId: tenantId.slice(0, 8) + '...',
    status: data.status,
    hasQR: Boolean(data.qr),
    attempts: data.connectionAttempts,
  }));

  res.json({
    ok: true,
    service: 'WhatsApp Multi-Tenant API (QR Debug)',
    version: '2.2.0',
    timestamp: Date.now(),
    clients: activeClients,
    totalClients: clients.size,
  });
});

// Status de todos os clientes
app.get('/status', (req, res) => {
  const statuses = {};
  
  for (const [tenantId, clientData] of clients.entries()) {
    statuses[tenantId] = {
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      hasQRString: Boolean(clientData.qrString),
      lastActivity: clientData.lastActivity,
      connectionAttempts: clientData.connectionAttempts,
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
    let clientData = clients.get(tenantId);
    
    if (!clientData) {
      log.info(`Cliente ${tenantId} não existe. Criando...`);
      clientData = await ensureClient(tenantId);
    }
    
    res.json({
      ok: true,
      tenantId,
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      hasQRString: Boolean(clientData.qrString),
      lastActivity: clientData.lastActivity,
      connectionAttempts: clientData.connectionAttempts,
    });
  } catch (error) {
    log.error(`Erro ao obter status de ${tenantId}:`, error.message);
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
    let clientData = clients.get(tenantId);
    
    // Se não existe, cria
    if (!clientData) {
      log.info(`Cliente ${tenantId} não existe. Criando para gerar QR...`);
      clientData = await ensureClient(tenantId);
      
      // Aguarda até 30 segundos para o QR aparecer
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (clientData.qr || clientData.qrString) {
          break;
        }
      }
    }

    if (clientData.qr) {
      log.success(`QR Code retornado para ${tenantId}`);
      res.json({
        ok: true,
        tenantId,
        qr: clientData.qr,
        qrString: clientData.qrString,
        status: clientData.status,
        message: 'Escaneie o QR Code com o WhatsApp',
      });
    } else {
      const message = clientData.status === 'ready' 
        ? 'Cliente já está conectado. QR Code não é necessário.' 
        : clientData.status === 'blocked'
        ? 'IP bloqueado temporariamente. Aguarde alguns minutos.'
        : clientData.status === 'connecting'
        ? 'Conectando... QR Code será gerado em breve. Aguarde 10-30 segundos.'
        : 'QR Code ainda não foi gerado. Tente novamente em alguns segundos.';
      
      log.warn(`QR Code não disponível para ${tenantId}: ${message}`);
      
      res.json({
        ok: false,
        message,
        status: clientData.status,
        attempts: clientData.connectionAttempts,
      });
    }
  } catch (error) {
    log.error(`Erro ao obter QR de ${tenantId}:`, error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// Forçar geração de novo QR
app.post('/generate-qr/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    log.info(`Forçando geração de QR para ${tenantId}...`);
    
    // Remove cliente existente
    const oldClient = clients.get(tenantId);
    if (oldClient?.sock) {
      try {
        await oldClient.sock.logout();
      } catch (e) {
        // Ignora erros ao deslogar
      }
    }
    clients.delete(tenantId);

    // Remove sessão
    const sessionDir = path.join(AUTH_DIR, tenantId);
    await fs.remove(sessionDir);

    // Cria novo cliente
    const clientData = await ensureClient(tenantId, true);

    // Aguarda QR aparecer (máximo 30 segundos)
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (clientData.qr) {
        log.success(`QR gerado com sucesso para ${tenantId}!`);
        return res.json({
          ok: true,
          tenantId,
          message: 'QR Code gerado. Use GET /qr/:tenantId para obter.',
          status: clientData.status,
        });
      }
    }

    res.json({
      ok: false,
      message: 'QR Code não foi gerado após 30 segundos. Verifique os logs.',
      status: clientData.status,
    });
  } catch (error) {
    log.error(`Erro ao gerar QR para ${tenantId}:`, error.message);
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

// Resetar cliente
app.post('/reset/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  try {
    log.info(`Resetando cliente ${tenantId}...`);
    
    const clientData = clients.get(tenantId);
    if (clientData?.sock) {
      try {
        await clientData.sock.logout();
      } catch (e) {
        // Ignora
      }
    }
    clients.delete(tenantId);

    const sessionDir = path.join(AUTH_DIR, tenantId);
    await fs.remove(sessionDir);

    log.success(`Cliente ${tenantId} resetado!`);

    // Aguarda 2 segundos
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Reconecta
    const newClient = await ensureClient(tenantId, true);

    res.json({
      ok: true,
      tenantId,
      message: 'Cliente resetado com sucesso',
      status: newClient.status,
    });
  } catch (error) {
    log.error(`Erro ao resetar ${tenantId}:`, error.message);
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
    if (clientData?.sock) {
      try {
        await clientData.sock.logout();
      } catch (e) {
        // Ignora
      }
    }
    clients.delete(tenantId);

    log.success(`Cliente ${tenantId} desconectado`);

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
  log.success(`═══════════════════════════════════════════════════════`);
  log.success(`  Servidor WhatsApp Multi-Tenant (QR Debug Mode)`);
  log.success(`  Porta: ${PORT}`);
  log.success(`  Auth Dir: ${AUTH_DIR}`);
  log.success(`═══════════════════════════════════════════════════════`);
  console.log('');
  log.info('Endpoints disponíveis:');
  log.info('  GET  /                      - Health check');
  log.info('  GET  /status                - Status de todos os clientes');
  log.info('  GET  /status/:tenantId      - Status de um cliente');
  log.info('  GET  /qr/:tenantId          - Obter QR Code');
  log.info('  POST /generate-qr/:tenantId - Forçar geração de QR');
  log.info('  POST /send                  - Enviar mensagem');
  log.info('  POST /reset/:tenantId       - Resetar cliente');
  log.info('  POST /disconnect/:tenantId  - Desconectar cliente');
  console.log('');
});

// Limpeza ao encerrar
process.on('SIGINT', async () => {
  log.warn('Encerrando servidor...');
  
  for (const [tenantId, clientData] of clients.entries()) {
    try {
      await clientData.sock?.logout();
      log.info(`Cliente ${tenantId} desconectado`);
    } catch (error) {
      // Ignora erros
    }
  }
  
  process.exit(0);
});
