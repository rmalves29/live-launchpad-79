// Servidor WhatsApp Multi-Tenant Melhorado
// Corrige problemas de conexão e adiciona suporte robusto para múltiplos tenants

import express from 'express';
import cors from 'cors';
import { Client, LocalAuth } from '@whiskeysockets/baileys';
import makeWASocket from '@whiskeysockets/baileys';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import pino from 'pino';

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

// Logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

// Estado em memória dos clientes WhatsApp
const clients = new Map();

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
 * Cria ou retorna cliente WhatsApp para um tenant
 */
async function ensureClient(tenantId) {
  // Retorna se já existe
  if (clients.has(tenantId)) {
    const clientData = clients.get(tenantId);
    if (clientData.status === 'ready' || clientData.status === 'connecting') {
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

  // Cria socket WhatsApp
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    browser: ['OrderZaps', 'Chrome', '1.0.0'],
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    defaultQueryTimeoutMs: 60000,
  });

  const clientData = {
    sock,
    status: 'connecting',
    qr: null,
    lastActivity: Date.now(),
    config,
  };

  clients.set(tenantId, clientData);

  // Evento: QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 8 });
        clientData.qr = qrDataUrl;
        clientData.status = 'qr';
        logger.info({ tenantId }, 'QR Code gerado');
      } catch (error) {
        logger.error({ tenantId, error: error.message }, 'Erro ao gerar QR Code');
      }
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
      logger.warn({ tenantId, shouldReconnect }, 'Conexão fechada');

      if (shouldReconnect) {
        clientData.status = 'reconnecting';
        // Reconecta após 5 segundos
        setTimeout(() => ensureClient(tenantId), 5000);
      } else {
        clientData.status = 'auth_failure';
        clients.delete(tenantId);
        // Remove sessão inválida
        await fs.remove(sessionDir);
      }
    } else if (connection === 'open') {
      clientData.status = 'ready';
      clientData.qr = null;
      clientData.lastActivity = Date.now();
      logger.info({ tenantId }, 'WhatsApp conectado');
    }
  });

  // Evento: Credenciais atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Evento: Mensagens recebidas
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || '';

      logger.info({ tenantId, from, text }, 'Mensagem recebida');

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

    return {
      success: true,
      messageId: result.key.id,
      timestamp: result.messageTimestamp,
    };
  } catch (error) {
    logger.error({ tenantId, phone, error: error.message }, 'Erro ao enviar mensagem');
    throw error;
  }
}

// ===== ROTAS =====

// Health check
app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'WhatsApp Multi-Tenant API',
    version: '2.0.0',
    timestamp: Date.now(),
    clients: clients.size,
  });
});

// Status de todos os clientes
app.get('/status', (req, res) => {
  const statuses = {};
  
  for (const [tenantId, clientData] of clients.entries()) {
    statuses[tenantId] = {
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      lastActivity: clientData.lastActivity,
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
    const clientData = await ensureClient(tenantId);
    
    res.json({
      ok: true,
      tenantId,
      status: clientData.status,
      hasQR: Boolean(clientData.qr),
      lastActivity: clientData.lastActivity,
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
      });
    } else {
      res.json({
        ok: false,
        error: 'QR Code não disponível',
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

  for (const phone of phones) {
    try {
      const result = await sendMessage(tenantId, phone, message);
      results.push({ phone, success: true, ...result });
      
      // Aguarda 1 segundo entre mensagens para evitar bloqueio
      await new Promise(resolve => setTimeout(resolve, 1000));
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
    if (clientData?.sock) {
      await clientData.sock.logout();
    }
    clients.delete(tenantId);

    // Remove sessão do disco
    const sessionDir = path.join(AUTH_DIR, tenantId);
    await fs.remove(sessionDir);

    logger.info({ tenantId }, 'Cliente resetado');

    // Reconecta
    await ensureClient(tenantId);

    res.json({
      ok: true,
      tenantId,
      message: 'Cliente resetado e reconectado',
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
    if (clientData?.sock) {
      await clientData.sock.logout();
    }
    clients.delete(tenantId);

    logger.info({ tenantId }, 'Cliente desconectado');

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
  logger.info({ port: PORT, authDir: AUTH_DIR }, 'Servidor WhatsApp Multi-Tenant iniciado');
});

// Limpeza ao encerrar
process.on('SIGINT', async () => {
  logger.info('Encerrando servidor...');
  
  for (const [tenantId, clientData] of clients.entries()) {
    try {
      await clientData.sock?.logout();
      logger.info({ tenantId }, 'Cliente desconectado');
    } catch (error) {
      logger.error({ tenantId, error: error.message }, 'Erro ao desconectar cliente');
    }
  }
  
  process.exit(0);
});
