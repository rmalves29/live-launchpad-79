/**
 * WhatsApp Multi-Tenant Server - Ultra Stable Version
 * Foco em estabilidade, simplicidade e recuperação de erros
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore,
  delay
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

// ============= Configurações Conservadoras =============
const CONFIG = {
  PORT: Number(process.env.PORT || 8080),
  AUTH_DIR: process.env.AUTH_DIR || path.join(process.cwd(), '.baileys_auth'),
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  
  // Timeouts conservadores
  CONNECT_TIMEOUT_MS: 90_000, // 90 segundos
  KEEPALIVE_INTERVAL_MS: 45_000, // 45 segundos
  QR_TIMEOUT_MS: 120_000, // 2 minutos
  
  // Cooldowns
  ERROR_405_COOLDOWN_MS: 15 * 60 * 1000, // 15 minutos
  RECONNECT_DELAY_MS: 60_000, // 1 minuto entre tentativas
  MAX_RECONNECT_ATTEMPTS: 2, // Máximo 2 tentativas automáticas
};

const logger = pino({ level: 'silent' });

// Garantir diretório de autenticação
try {
  fs.mkdirSync(CONFIG.AUTH_DIR, { recursive: true, mode: 0o755 });
  console.log('✅ Diretório de autenticação:', CONFIG.AUTH_DIR);
} catch (err) {
  console.error('❌ Erro ao criar diretório:', err);
}

// ============= Gerenciador de Tenants Simplificado =============
class SimpleTenantManager {
  constructor() {
    this.sockets = new Map();
    this.status = new Map();
    this.qrCache = new Map();
    this.authDirs = new Map();
    this.lastError405 = new Map();
    this.reconnectAttempts = new Map();
  }

  getAuthDir(tenantId) {
    if (this.authDirs.has(tenantId)) {
      return this.authDirs.get(tenantId);
    }
    
    const dir = path.join(CONFIG.AUTH_DIR, `tenant_${tenantId}`);
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      this.authDirs.set(tenantId, dir);
    } catch (err) {
      console.error(`❌ Erro ao criar diretório para ${tenantId}:`, err);
    }
    return dir;
  }

  async createSocket(tenant) {
    const tenantId = tenant.id;
    
    // Se já existe socket ativo, retornar
    if (this.sockets.has(tenantId)) {
      console.log(`⚠️  Socket já existe para ${tenant.slug}`);
      return this.sockets.get(tenantId);
    }

    const authDir = this.getAuthDir(tenantId);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 Criando sessão para: ${tenant.name}`);
    console.log(`📂 Diretório: ${authDir}`);
    console.log(`🆔 Tenant ID: ${tenantId}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      
      console.log(`✅ Estado carregado`);
      console.log(`🔑 Tem credenciais: ${state.creds?.me ? 'SIM' : 'NÃO'}`);

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        getMessage: async () => ({ conversation: 'OrderZaps' }),
        connectTimeoutMs: CONFIG.CONNECT_TIMEOUT_MS,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: CONFIG.KEEPALIVE_INTERVAL_MS,
        syncFullHistory: false,
        // Configurações adicionais para estabilidade
        retryRequestDelayMs: 350,
        maxMsgRetryCount: 3,
        markOnlineOnConnect: true,
      });

      console.log(`✅ Socket criado`);

      // Eventos do socket
      sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(sock, tenant, update, saveCreds);
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('error', (error) => {
        console.error(`❌ Socket error (${tenant.slug}):`, error.message);
      });

      this.sockets.set(tenantId, sock);
      this.status.set(tenantId, 'connecting');
      
      return sock;
      
    } catch (error) {
      console.error(`❌ Erro ao criar socket para ${tenant.slug}:`, error);
      this.status.set(tenantId, 'error');
      throw error;
    }
  }

  async handleConnectionUpdate(sock, tenant, update, saveCreds) {
    const { connection, lastDisconnect, qr } = update;
    const tenantId = tenant.id;

    console.log(`📡 [${tenant.slug}] connection.update:`, {
      connection,
      hasQr: !!qr,
      hasError: !!lastDisconnect?.error
    });

    // QR Code gerado
    if (qr) {
      this.status.set(tenantId, 'qr_code');
      try {
        const dataURL = await QRCode.toDataURL(qr);
        this.qrCache.set(tenantId, { raw: qr, dataURL });
        console.log(`📱 QR gerado para ${tenant.slug}`);
      } catch (err) {
        console.error(`❌ Erro ao gerar QR:`, err);
        this.qrCache.set(tenantId, { raw: qr });
      }
      return;
    }

    // Conectado com sucesso
    if (connection === 'open') {
      this.status.set(tenantId, 'online');
      this.qrCache.delete(tenantId);
      this.reconnectAttempts.delete(tenantId);
      this.lastError405.delete(tenantId);
      console.log(`✅ ${tenant.slug}: CONECTADO`);
      return;
    }

    // Conectando
    if (connection === 'connecting') {
      this.status.set(tenantId, 'connecting');
      console.log(`🔄 ${tenant.slug}: Conectando...`);
      return;
    }

    // Conexão fechada - tratar erro
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'Desconhecido';
      
      console.error(`\n❌ ${tenant.slug}: DESCONECTADO`);
      console.error(`📊 Status Code: ${statusCode}`);
      console.error(`💬 Erro: ${errorMessage}`);
      
      // Erro 405 - Connection Failure (IP bloqueado temporariamente)
      if (statusCode === 405) {
        console.error(`⚠️  Erro 405: WhatsApp bloqueou o IP temporariamente`);
        this.lastError405.set(tenantId, Date.now());
        this.status.set(tenantId, 'error');
        this.sockets.delete(tenantId);
        this.qrCache.delete(tenantId);
        
        // Limpar sessão
        const authDir = this.authDirs.get(tenantId);
        if (authDir && fs.existsSync(authDir)) {
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
            console.log(`🗑️  Sessão limpa (erro 405)`);
          } catch (err) {
            console.error(`❌ Erro ao limpar sessão:`, err);
          }
        }
        return;
      }

      // Erro 401 ou 515 - Sessão inválida
      if (statusCode === 401 || statusCode === 515) {
        console.error(`⚠️  Erro ${statusCode}: Sessão inválida, limpando...`);
        this.status.set(tenantId, 'error');
        this.sockets.delete(tenantId);
        this.qrCache.delete(tenantId);
        
        // Limpar sessão
        const authDir = this.authDirs.get(tenantId);
        if (authDir && fs.existsSync(authDir)) {
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
            console.log(`🗑️  Sessão limpa (erro ${statusCode})`);
          } catch (err) {
            console.error(`❌ Erro ao limpar sessão:`, err);
          }
        }
        return;
      }

      // Outros erros - tentar reconectar (max 2 vezes)
      const attempts = this.reconnectAttempts.get(tenantId) || 0;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                              statusCode !== 440 && 
                              attempts < CONFIG.MAX_RECONNECT_ATTEMPTS;

      if (shouldReconnect) {
        this.status.set(tenantId, 'reconnecting');
        this.reconnectAttempts.set(tenantId, attempts + 1);
        
        console.log(`🔄 Tentativa ${attempts + 1}/${CONFIG.MAX_RECONNECT_ATTEMPTS} em 60s...`);
        
        setTimeout(async () => {
          this.sockets.delete(tenantId);
          try {
            await this.createSocket(tenant);
          } catch (err) {
            console.error(`❌ Erro na reconexão:`, err);
          }
        }, CONFIG.RECONNECT_DELAY_MS);
      } else {
        this.status.set(tenantId, 'disconnected');
        this.sockets.delete(tenantId);
        this.qrCache.delete(tenantId);
        this.reconnectAttempts.delete(tenantId);
        
        if (attempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
          console.error(`⛔ Máximo de tentativas atingido`);
        }
      }
    }
  }

  getStatus(tenantId) {
    return {
      status: this.status.get(tenantId) || 'not_found',
      connected: this.status.get(tenantId) === 'online'
    };
  }

  getQR(tenantId) {
    return this.qrCache.get(tenantId);
  }

  async reset(tenantId) {
    const sock = this.sockets.get(tenantId);
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        console.error(`❌ Erro ao fazer logout:`, err);
      }
    }

    this.sockets.delete(tenantId);
    this.status.delete(tenantId);
    this.qrCache.delete(tenantId);
    this.reconnectAttempts.delete(tenantId);
    this.lastError405.delete(tenantId);

    const authDir = this.authDirs.get(tenantId);
    if (authDir && fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`🗑️  Sessão resetada`);
      } catch (err) {
        console.error(`❌ Erro ao resetar:`, err);
      }
    }
  }
}

// ============= Helpers Supabase =============
async function getTenantById(id) {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase não configurado');
  }

  const url = `${CONFIG.SUPABASE_URL}/rest/v1/tenants?id=eq.${id}&is_active=eq.true&select=id,name,slug&limit=1`;
  
  const response = await fetch(url, {
    headers: {
      'apikey': CONFIG.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status}`);
  }

  const tenants = await response.json();
  return tenants[0] || null;
}

// ============= Express App =============
const app = express();
const manager = new SimpleTenantManager();

// CORS
app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));

// Logs
app.use((req, res, next) => {
  console.log(`\n📥 ${req.method} ${req.path}`);
  next();
});

// Health check expandido
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'online',
    version: '5.0-stable',
    uptime: Math.round(process.uptime()),
    memory: {
      heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    tenants: {
      total: manager.sockets.size,
      online: Array.from(manager.status.values()).filter(s => s === 'online').length,
    },
  });
});

// Status de um tenant
app.get('/status/:tenantId', (req, res) => {
  const status = manager.getStatus(req.params.tenantId);
  res.json({ ok: true, tenantId: req.params.tenantId, ...status });
});

// Conectar
app.post('/connect', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.body.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ ok: false, error: 'tenant_id obrigatório' });
    }

    // Verificar cooldown 405
    const last405 = manager.lastError405.get(tenantId);
    if (last405) {
      const elapsed = Date.now() - last405;
      const remaining = CONFIG.ERROR_405_COOLDOWN_MS - elapsed;
      
      if (remaining > 0) {
        const minutes = Math.ceil(remaining / 60000);
        return res.status(429).json({
          ok: false,
          error: 'Cooldown ativo após erro 405',
          cooldownRemaining: minutes,
        });
      }
      
      // Cooldown expirou
      manager.lastError405.delete(tenantId);
      manager.status.delete(tenantId);
      manager.reconnectAttempts.delete(tenantId);
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return res.status(404).json({ ok: false, error: 'Tenant não encontrado' });
    }

    console.log(`✅ Tenant encontrado: ${tenant.name}`);

    await manager.createSocket(tenant);
    const status = manager.getStatus(tenantId).status;

    res.json({ ok: true, tenantId, status });
  } catch (error) {
    console.error(`❌ Erro em /connect:`, error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// QR Code
app.get('/qr', (req, res) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  
  if (!tenantId) {
    return res.status(400).json({ ok: false, error: 'tenant_id obrigatório' });
  }

  // Verificar cooldown
  const status = manager.status.get(tenantId);
  const last405 = manager.lastError405.get(tenantId);
  
  if (status === 'error' && last405) {
    const elapsed = Date.now() - last405;
    const remaining = CONFIG.ERROR_405_COOLDOWN_MS - elapsed;
    
    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60000);
      return res.status(429).json({
        ok: false,
        status: 'cooldown',
        cooldownRemaining: minutes,
      });
    }
    
    // Cooldown expirou, indicar necessidade de reconexão
    manager.lastError405.delete(tenantId);
    manager.status.delete(tenantId);
    return res.status(200).json({
      ok: false,
      status: 'reconnect_required',
      message: 'Cooldown expirou. Inicie nova conexão.',
    });
  }

  const qr = manager.getQR(tenantId);
  if (!qr) {
    return res.status(204).end();
  }

  res.json({
    ok: true,
    tenantId,
    qr: qr.raw,
    qrDataURL: qr.dataURL || null,
  });
});

// Reset
app.post('/reset/:tenantId', async (req, res) => {
  try {
    await manager.reset(req.params.tenantId);
    res.json({ ok: true, message: 'Sessão resetada' });
  } catch (error) {
    console.error(`❌ Erro em /reset:`, error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Rota não encontrada' });
});

// ============= Start Server =============
const server = app.listen(CONFIG.PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 WhatsApp Multi-Tenant v5.0 STABLE`);
  console.log(`📂 Auth: ${CONFIG.AUTH_DIR}`);
  console.log(`🌐 Port: ${CONFIG.PORT}`);
  console.log(`⏱️  Connect timeout: ${CONFIG.CONNECT_TIMEOUT_MS / 1000}s`);
  console.log(`🔄 Keepalive: ${CONFIG.KEEPALIVE_INTERVAL_MS / 1000}s`);
  console.log(`${'='.repeat(60)}\n`);
});

// Graceful shutdown
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n⚠️  ${signal} recebido, encerrando...`);
  
  // Fechar conexões WhatsApp
  for (const [tenantId, sock] of manager.sockets.entries()) {
    try {
      await sock.end();
      console.log(`✅ Conexão fechada: ${tenantId}`);
    } catch (err) {
      console.error(`⚠️  Erro ao fechar ${tenantId}:`, err.message);
    }
  }
  
  // Fechar servidor HTTP
  server.close(() => {
    console.log(`✅ Servidor HTTP fechado`);
    process.exit(0);
  });
  
  // Timeout forçado
  setTimeout(() => {
    console.error(`⏰ Timeout, forçando saída`);
    process.exit(1);
  }, 25000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Prevenir crashes
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

console.log(`✅ Servidor pronto para conexões`);
