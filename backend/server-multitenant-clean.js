/**
 * ========================================
 * WhatsApp Multi‑Tenant Server – Clean Architecture v4.1
 * ========================================
 *
 * • Um único app (Railway) atendendo N empresas por SUBDOMÍNIO ou header X-Tenant-Id
 * • Sessões iniciadas sob demanda (lazy) e isoladas por tenant
 * • QR Code via endpoint /qr (sem depender de terminal)
 * • Persistência de sessão em volume (/data) – recomendável no Railway
 * • Supabase usado apenas via SERVICE_ROLE em variável de ambiente (NÃO hardcode)
 * • Puppeteer headless, compatível com Railway (Linux)
 *
 * Autor: Sistema OrderZaps
 */

// ===================== Dependências =====================
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';

// ===================== Configurações =====================
const CONFIG = {
  PORT: Number(process.env.PORT || 8080),
  // Preferir volume montado no Railway em /data  
  AUTH_DIR: process.env.AUTH_DIR || '/data/.baileys_auth',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL, // ex: https://xxxxx.supabase.co
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY, // ***NÃO hardcode***

  // CORS (se quiser restringir)
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim()),
};

// Logger silencioso
const logger = pino({ level: 'silent' });

// Valida envs críticas
if (!CONFIG.SUPABASE_URL) console.warn('⚠️  SUPABASE_URL não configurado');
if (!CONFIG.SUPABASE_SERVICE_KEY) console.warn('⚠️  SUPABASE_SERVICE_KEY não configurado');

// Garante diretório de auth
try {
  fs.mkdirSync(CONFIG.AUTH_DIR, { recursive: true });
} catch (_) {}

// ===================== Helpers: Supabase =====================
class SupabaseHelper {
  static async request(pathname, options = {}) {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase não configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY)');
    }
    const url = `${CONFIG.SUPABASE_URL}/rest/v1${pathname}`;
    const headers = {
      apikey: CONFIG.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };
    const resp = await fetch(url, { ...options, headers });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Supabase ${resp.status}: ${txt}`);
    }
    return resp.json();
  }

  static async loadActiveTenants() {
    // usado apenas se quiser pré-carregar (não obrigatório no modo lazy)
    try {
      return await this.request('/tenants?select=id,name,slug,is_active&is_active=eq.true');
    } catch (e) {
      console.error('❌ Erro ao carregar tenants:', e.message);
      return [];
    }
  }

  static async resolveTenantBySlug(slug) {
    try {
      const list = await this.request(
        `/tenants?select=id,name,slug,is_active&slug=eq.${slug}&is_active=eq.true&limit=1`
      );
      return list[0] || null;
    } catch (e) {
      console.error('❌ Erro ao buscar tenant por slug:', e.message);
      return null;
    }
  }

  static async resolveTenantById(id) {
    try {
      const list = await this.request(
        `/tenants?select=id,name,slug,is_active&id=eq.${id}&is_active=eq.true&limit=1`
      );
      return list[0] || null;
    } catch (e) {
      console.error('❌ Erro ao buscar tenant por id:', e.message);
      return null;
    }
  }

  static async logMessage(tenant_id, phone, message, type, metadata = {}) {
    try {
      await this.request('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id,
          phone,
          message,
          type, // 'outgoing' | 'incoming'
          sent_at: type === 'outgoing' ? new Date().toISOString() : null,
          received_at: type === 'incoming' ? new Date().toISOString() : null,
          ...metadata,
        }),
      });
    } catch (e) {
      console.error('⚠️  Erro ao salvar log:', e.message);
    }
  }
}

// ===================== Tenant Manager =====================
class TenantManager {
  constructor() {
    this.sockets = new Map(); // tenantId -> WASocket
    this.status = new Map(); // tenantId -> status  
    this.authDirs = new Map(); // tenantId -> auth path
    this.qrCache = new Map(); // tenantId -> { raw, dataURL? }
    this.authStates = new Map(); // tenantId -> authState
    this.reconnectAttempts = new Map(); // tenantId -> count
    this.lastError405 = new Map(); // tenantId -> timestamp do último erro 405
    this.COOLDOWN_405_MS = 15 * 60 * 1000; // 15 minutos de cooldown
  }

  createAuthDir(tenantId) {
    const dir = path.join(CONFIG.AUTH_DIR, `tenant_${tenantId}`);
    try {
      fs.mkdirSync(dir, { recursive: true });
      this.authDirs.set(tenantId, dir);
    } catch (_) {}
    return dir;
  }

  async createClient(tenant) {
    const tenantId = tenant.id;
    if (this.sockets.get(tenantId)) {
      console.log(`⚠️ Cliente já existe para ${tenant.slug}, retornando existente`);
      return this.sockets.get(tenantId);
    }

    const authDir = this.createAuthDir(tenantId);
    console.log(`\n${'='.repeat(70)}\n🔧 Inicializando sessão Baileys: ${tenant.name} (${tenant.slug})\n🆔 ${tenantId}\n📂 ${authDir}\n${'='.repeat(70)}`);

    try {
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      this.authStates.set(tenantId, { state, saveCreds });
      
      console.log(`✅ Estado de autenticação carregado`);
      console.log(`🔑 Credenciais existentes: ${state.creds?.me ? 'SIM' : 'NÃO'}`);

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        getMessage: async () => ({ conversation: 'OrderZaps' }),
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 30_000,
        syncFullHistory: false,
      });

      console.log(`✅ Socket criado com sucesso`);

      // Proteção contra erros não tratados do socket
      sock.ev.on('error', (error) => {
        console.error(`❌ Socket error para ${tenant.slug}:`, error);
      });

      // QR Code
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log(`📡 ${tenant.slug} - connection.update:`, { connection, hasQr: !!qr, hasError: !!lastDisconnect?.error });

        if (qr) {
          this.status.set(tenantId, 'qr_code');
          try {
            const dataURL = await QRCode.toDataURL(qr);
            this.qrCache.set(tenantId, { raw: qr, dataURL });
            console.log(`📱 QR gerado para ${tenant.slug}`);
          } catch (err) {
            this.qrCache.set(tenantId, { raw: qr });
            console.error('❌ Erro ao gerar QR DataURL:', err.message);
          }
        }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Desconhecido';
        const errorData = lastDisconnect?.error?.data;
        const errorReason = errorData?.reason;
        
        console.error(`\n❌ ${tenant.slug}: CONEXÃO FECHADA`);
        console.error(`📊 Status Code: ${statusCode}`);
        console.error(`💬 Erro: ${errorMessage}`);
        console.error(`📋 Error Data:`, errorData);
        console.error(`🔍 DisconnectReason.loggedOut: ${DisconnectReason.loggedOut}`);
        console.error(`🔍 DisconnectReason.restartRequired: ${DisconnectReason.restartRequired}`);
        console.error(`🔍 DisconnectReason.connectionLost: ${DisconnectReason.connectionLost}`);
        
        // Erros que requerem limpeza de sessão (405, 401, 515)
        const needsSessionReset = [405, 401, 515].includes(statusCode) || errorReason === '405';
        
        if (needsSessionReset) {
          console.error(`⚠️  Erro ${statusCode} detectado - limpando sessão corrompida`);
          
          // Registrar timestamp do erro 405 especificamente
          if (statusCode === 405 || errorReason === '405') {
            this.lastError405.set(tenantId, Date.now());
            console.error(`⏰ Erro 405 registrado. Cooldown de 15 minutos ativado.`);
          }
          
          this.status.set(tenantId, 'error');
          this.sockets.delete(tenantId);
          this.qrCache.delete(tenantId);
          this.reconnectAttempts.delete(tenantId);
          
          // Limpar diretório de autenticação
          try {
            const authDir = this.authDirs.get(tenantId);
            if (authDir && fs.existsSync(authDir)) {
              fs.rmSync(authDir, { recursive: true, force: true });
              console.log(`🗑️  Sessão ${tenant.slug} removida - necessário novo QR Code`);
            }
          } catch (err) {
            console.error(`❌ Erro ao limpar sessão:`, err);
          }
          return;
        }
        
        // Não reconectar se for logout ou timeout
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 440;
        const attempts = this.reconnectAttempts.get(tenantId) || 0;
        
        console.log(`🔄 Reconectar? ${shouldReconnect} (tentativa ${attempts + 1}/3)`);
        
        if (shouldReconnect && attempts < 3) {
          this.status.set(tenantId, 'reconnecting');
          this.reconnectAttempts.set(tenantId, attempts + 1);
          
          const delay = 10000 * (attempts + 1); // 10s, 20s, 30s
          console.log(`⏰ Aguardando ${delay/1000}s antes de reconectar...`);
          
          setTimeout(() => {
            console.log(`🔄 Tentando reconexão ${attempts + 1} para ${tenant.slug}...`);
            this.sockets.delete(tenantId);
            this.createClient(tenant).catch((err) => {
              console.error(`❌ Erro na reconexão ${attempts + 1}:`, err.message);
            });
          }, delay);
        } else {
          if (attempts >= 3) {
            console.error(`⛔ ${tenant.slug}: Máximo de tentativas atingido (3)`);
            console.error(`💡 Aguardando nova solicitação de /connect para retentar`);
          }
          this.status.set(tenantId, 'disconnected');
          this.sockets.delete(tenantId);
          this.qrCache.delete(tenantId);
          this.reconnectAttempts.delete(tenantId);
        }
      } else if (connection === 'open') {
        this.status.set(tenantId, 'online');
        this.qrCache.delete(tenantId);
        this.reconnectAttempts.set(tenantId, 0); // Reset tentativas
        console.log(`✅ ${tenant.slug}: CONECTADO (Baileys)`);
      } else if (connection === 'connecting') {
        console.log(`🔄 ${tenant.slug}: Conectando...`);
        this.status.set(tenantId, 'connecting');
      }
    });

      // Salvar credenciais
      sock.ev.on('creds.update', saveCreds);

      // Mensagens recebidas
      sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        console.log(`📩 ${tenant.slug} recebeu de ${from}: ${text}`);

        // Log no Supabase
        try {
          await SupabaseHelper.logMessage(tenantId, from, text, 'incoming', { messageId: msg.key.id });
        } catch (err) {
          console.error('❌ Erro ao logar mensagem:', err.message);
        }
      });

      this.sockets.set(tenantId, sock);
      this.status.set(tenantId, 'initializing');
      console.log(`✅ Eventos registrados, aguardando conexão...`);

      return sock;
    } catch (error) {
      console.error(`❌ ERRO FATAL ao criar cliente para ${tenant.slug}:`, error);
      this.status.set(tenantId, 'error');
      throw error;
    }
  }

  async getOnlineClient(tenantId) {
    const sock = this.sockets.get(tenantId);
    const stat = this.status.get(tenantId);
    if (!sock || stat !== 'online') return null;
    return sock;
  }

  getAllStatus() {
    const out = {};
    for (const [tenantId] of this.sockets) {
      out[tenantId] = { status: this.status.get(tenantId) || 'unknown' };
    }
    return out;
  }

  getTenantStatus(tenantId) {
    return { status: this.status.get(tenantId) || 'not_found' };
  }

  async resetTenant(tenantId) {
    const sock = this.sockets.get(tenantId);
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        console.error('❌ Erro ao fazer logout:', e.message);
      }
    }

    this.sockets.delete(tenantId);
    this.status.delete(tenantId);
    this.qrCache.delete(tenantId);
    this.authStates.delete(tenantId);
    this.reconnectAttempts.delete(tenantId);

    const authDir = this.authDirs.get(tenantId);
    if (authDir && fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`🗑️  Sessão limpa: ${authDir}`);
      } catch (e) {
        console.error('❌ Erro ao limpar sessão:', e.message);
      }
    }
  }
}

// ===================== Utils =====================
function normalizePhoneBR(phone) {
  if (!phone) return phone;
  const clean = String(phone).replace(/\D/g, '');
  const withoutDDI = clean.startsWith('55') ? clean.slice(2) : clean;
  let n = withoutDDI;
  if (n.length === 10) {
    const ddd = n.slice(0, 2);
    if (Number(ddd) >= 11) n = `${ddd}9${n.slice(2)}`;
  }
  return `55${n}`;
}

function getSubdomain(host) {
  if (!host) return null;
  const h = String(host).split(':')[0];
  const parts = h.split('.');
  if (parts.length < 3) return null; // ex.: api.orderzaps.com -> sem sub útil
  return parts[0];
}

// ===================== App (Express) =====================
async function createApp(tenantManager) {
  const app = express();

  // CORS
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || CONFIG.ALLOWED_ORIGINS.includes('*')) return cb(null, true);
        const ok = CONFIG.ALLOWED_ORIGINS.some((o) => origin.includes(o));
        return cb(null, ok);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));

  // ====== Log de todas as requisições ======
  app.use((req, res, next) => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log(`📥 Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`📥 Query:`, JSON.stringify(req.query, null, 2));
    console.log(`📥 Body:`, JSON.stringify(req.body, null, 2));
    console.log(`${'='.repeat(70)}\n`);
    next();
  });

  // ====== Middleware: resolve tenant por header/body ======
  app.use((req, _res, next) => {
    console.log('🔍 [MIDDLEWARE] Tentando resolver tenant...');
    let tenantId =
      req.headers['x-tenant-id'] ||
      req.headers['X-Tenant-Id'] ||
      req.query.tenant_id ||
      (req.body && req.body.tenant_id);

    if (tenantId) {
      tenantId = String(tenantId).split(',')[0].trim();
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuid.test(tenantId)) {
        req.tenantId = tenantId;
        console.log('✅ [MIDDLEWARE] Tenant resolvido por header/body:', tenantId);
      } else {
        console.log('⚠️ [MIDDLEWARE] Tenant ID inválido (não é UUID):', tenantId);
      }
    } else {
      console.log('⚠️ [MIDDLEWARE] Nenhum tenant ID fornecido');
    }
    next();
  });

  // ====== Middleware: resolve tenant por subdomínio ======
  app.use(async (req, _res, next) => {
    if (req.tenantId) return next();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const slug = getSubdomain(host);
    if (!slug) return next();
    const t = await SupabaseHelper.resolveTenantBySlug(slug);
    if (t?.id) req.tenantId = t.id;
    next();
  });

  // ====== Health ======
  app.get('/health', (_req, res) => {
    res.json({ ok: true, status: 'online', time: new Date().toISOString(), version: '4.1' });
  });

  // ====== Status geral ======
  app.get('/status', (_req, res) => {
    res.json({ ok: true, tenants: tenantManager.getAllStatus() });
  });

  // ====== Status do tenant resolvido ======
  app.get('/status-tenant', (req, res) => {
    if (!req.tenantId) return res.status(400).json({ ok: false, error: 'Tenant não resolvido' });
    res.json({ ok: true, tenantId: req.tenantId, ...tenantManager.getTenantStatus(req.tenantId) });
  });

  // ====== Status por id ======
  app.get('/status/:tenantId', (req, res) => {
    const tenantId = req.params.tenantId;
    console.log('📡 [GET /status/:tenantId] Requisição para:', tenantId);
    const status = tenantManager.getTenantStatus(tenantId);
    console.log('📊 [GET /status/:tenantId] Status:', status);
    res.json({ ok: true, tenantId, ...status });
  });

  // ====== QR do tenant resolvido ======
  app.get('/qr', (req, res) => {
    console.log('📡 [GET /qr] Requisição recebida');
    console.log('📡 [GET /qr] Tenant ID:', req.tenantId);
    console.log('📡 [GET /qr] Headers:', JSON.stringify(req.headers, null, 2));
    
    if (!req.tenantId) {
      console.log('❌ [GET /qr] Tenant não resolvido');
      return res.status(400).json({ ok: false, error: 'Tenant não resolvido' });
    }
    
    // Verificar se o tenant está em estado de erro E se o cooldown ainda está ativo
    const status = tenantManager.status.get(req.tenantId);
    const lastError405Time = tenantManager.lastError405.get(req.tenantId);
    
    if (status === 'error' && lastError405Time) {
      const timeSinceError = Date.now() - lastError405Time;
      const cooldownRemaining = tenantManager.COOLDOWN_405_MS - timeSinceError;
      
      if (cooldownRemaining > 0) {
        const minutesRemaining = Math.ceil(cooldownRemaining / (60 * 1000));
        console.log(`⏰ [GET /qr] Cooldown ativo. ${minutesRemaining} minutos restantes.`);
        return res.status(429).json({ 
          ok: false, 
          status: 'cooldown',
          cooldownRemaining: minutesRemaining,
          error: `Aguarde ${minutesRemaining} minutos após erro 405` 
        });
      } else {
        // Cooldown expirado, limpar erro e permitir tentativa
        console.log('✅ [GET /qr] Cooldown expirado, limpando estado de erro');
        tenantManager.lastError405.delete(req.tenantId);
        tenantManager.status.delete(req.tenantId);
      }
    }
    
    const entry = tenantManager.qrCache.get(req.tenantId);
    if (!entry) {
      console.log('⚠️ [GET /qr] QR Code não disponível ainda');
      return res.status(204).end();
    }
    
    console.log('✅ [GET /qr] QR Code encontrado, tamanho:', entry.raw?.length || 0);
    res.json({ ok: true, tenantId: req.tenantId, qr: entry.raw, qrDataURL: entry.dataURL || null });
  });

  // ====== Conectar (força iniciar sessão) ======
  app.post('/connect', async (req, res) => {
    try {
      console.log('📡 [POST /connect] Requisição recebida');
      console.log('📡 [POST /connect] Tenant ID:', req.tenantId);
      console.log('📡 [POST /connect] Headers:', JSON.stringify(req.headers, null, 2));
      
      if (!req.tenantId) return res.status(400).json({ ok: false, error: 'Tenant não resolvido' });
      
      // Verificar cooldown após erro 405
      const lastError405Time = tenantManager.lastError405.get(req.tenantId);
      if (lastError405Time) {
        const timeSinceError = Date.now() - lastError405Time;
        const cooldownRemaining = tenantManager.COOLDOWN_405_MS - timeSinceError;
        
        if (cooldownRemaining > 0) {
          const minutesRemaining = Math.ceil(cooldownRemaining / (60 * 1000));
          console.error(`⏰ [POST /connect] Cooldown ativo. ${minutesRemaining} minutos restantes.`);
          console.error(`⏰ [POST /connect] Último erro 405: ${new Date(lastError405Time).toLocaleTimeString('pt-BR')}`);
          console.error(`⏰ [POST /connect] Liberação em: ${new Date(lastError405Time + tenantManager.COOLDOWN_405_MS).toLocaleTimeString('pt-BR')}`);
          
          return res.status(429).json({ 
            ok: false, 
            error: 'Cooldown ativo após erro 405',
            cooldownRemaining: minutesRemaining,
            message: `WhatsApp bloqueou novas conexões. Aguarde ${minutesRemaining} minutos.`,
            lastError405: new Date(lastError405Time).toISOString()
          });
        } else {
          // Cooldown expirado, limpar timestamp e status de erro
          tenantManager.lastError405.delete(req.tenantId);
          tenantManager.status.delete(req.tenantId);
          console.log(`✅ [POST /connect] Cooldown expirado. Limpando estado de erro e permitindo nova tentativa.`);
        }
      }
      
      let t = await SupabaseHelper.resolveTenantById(req.tenantId);
      if (!t) return res.status(404).json({ ok: false, error: 'Tenant não encontrado ou inativo' });
      
      console.log('✅ [POST /connect] Tenant encontrado:', t.name, t.slug);
      await tenantManager.createClient(t);
      
      const status = tenantManager.getTenantStatus(req.tenantId).status;
      console.log('✅ [POST /connect] Status:', status);
      
      res.json({ ok: true, tenantId: req.tenantId, status });
    } catch (e) {
      console.error('❌ [POST /connect] Erro:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ====== Reset (desconectar e limpar sessão) ======
  app.post('/reset/:tenantId', async (req, res) => {
    try {
      const tenantId = req.params.tenantId;
      console.log('🔄 [POST /reset] Requisição recebida para:', tenantId);
      
      await tenantManager.resetTenant(tenantId);
      
      console.log('✅ [POST /reset] Reset concluído');
      res.json({ ok: true, message: 'Sessão resetada com sucesso' });
    } catch (e) {
      console.error('❌ [POST /reset] Erro:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ====== Enviar mensagem ======
  app.post('/send', async (req, res) => {
    try {
      if (!req.tenantId) return res.status(400).json({ ok: false, error: 'Tenant não resolvido' });
      const { number, phone, message } = req.body || {};
      const to = number || phone;
      if (!to || !message) return res.status(400).json({ ok: false, error: 'Número e mensagem são obrigatórios' });

      // Tenta socket online
      let sock = await tenantManager.getOnlineClient(req.tenantId);
      if (!sock) {
        // lazy start
        const t = await SupabaseHelper.resolveTenantById(req.tenantId);
        if (!t) return res.status(404).json({ ok: false, error: 'Tenant não encontrado ou inativo' });
        await tenantManager.createClient(t);
        sock = await tenantManager.getOnlineClient(req.tenantId);
        if (!sock) {
          // pode estar em QR / initializing
          const s = tenantManager.getTenantStatus(req.tenantId).status;
          return res.status(503).json({ ok: false, error: 'WhatsApp não conectado', status: s });
        }
      }

      const normalized = normalizePhoneBR(to);
      const jid = `${normalized}@s.whatsapp.net`;
      await sock.sendMessage(jid, { text: message });
      SupabaseHelper.logMessage(req.tenantId, normalized, message, 'outgoing').catch(() => {});
      res.json({ ok: true, tenantId: req.tenantId, to: normalized });
    } catch (e) {
      console.error('❌ [POST /send] Erro:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ====== 404 ======
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada' }));

  return app;
}

// ===================== Bootstrap =====================
async function main() {
  console.log(`\n${'='.repeat(70)}\n🚀 WhatsApp Multi‑Tenant – v4.1 (Baileys)\nAuth: ${CONFIG.AUTH_DIR}\nPort: ${CONFIG.PORT}\n${'='.repeat(70)}\n`);
  
  const manager = new TenantManager();
  const app = await createApp(manager);
  
  const server = app.listen(CONFIG.PORT, () => {
    console.log(`▶️  HTTP ${CONFIG.PORT}`);
    console.log(`✅ Servidor rodando e pronto para conexões`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('⚠️  SIGTERM recebido, encerrando graciosamente...');
    server.close(() => {
      console.log('✅ Servidor fechado');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('⚠️  SIGINT recebido, encerrando graciosamente...');
    server.close(() => {
      console.log('✅ Servidor fechado');
      process.exit(0);
    });
  });

  // Prevenir crashes por erros não tratados
  process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION:', error);
    console.error('Stack:', error.stack);
    // NÃO sair do processo - apenas logar
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION:', reason);
    console.error('Promise:', promise);
    // NÃO sair do processo - apenas logar
  });
}

main().catch((e) => {
  console.error('❌ Erro fatal na inicialização:', e);
  console.error('Stack:', e.stack);
  process.exit(1);
});

/*
========================================
.env exemplo (Railway Variables)
========================================
PORT=8080
AUTH_DIR=/data/.baileys_auth
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_KEY=***SERVICE_ROLE***
ALLOWED_ORIGINS=*

# Railway → Settings
# • Add Domain: api.orderzaps.com (e opcional wildcard via Cloudflare)
# • Volumes: mount /data
# • Deploy: Node >= 18

Fluxo nova empresa (subdomínio):
1) Inserir na tabela tenants: { id(uuid), name, slug: "empresaX", is_active: true }
2) Acessar https://empresaX.orderzaps.com/connect (ou /qr para capturar o QR)
3) Enviar mensagem: POST https://empresaX.orderzaps.com/send { message, number }

NOTA: Agora usando @whiskeysockets/baileys (mais leve que whatsapp-web.js)
*/
