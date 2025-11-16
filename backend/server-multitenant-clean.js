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
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');

// Polyfill fetch (Node < 18)
if (typeof fetch !== 'function') {
  global.fetch = require('node-fetch');
}

// ===================== Configurações =====================
const CONFIG = {
  PORT: Number(process.env.PORT || 8080),
  // Preferir volume montado no Railway em /data
  AUTH_DIR: process.env.AUTH_DIR || '/data/.wwebjs_auth',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL, // ex: https://xxxxx.supabase.co
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY, // ***NÃO hardcode***

  // CORS (se quiser restringir)
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim()),
};

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
    this.clients = new Map(); // tenantId -> Client
    this.status = new Map(); // tenantId -> status
    this.authDirs = new Map(); // tenantId -> auth path
    this.qrCache = new Map(); // tenantId -> { raw, dataURL? }
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
    if (this.clients.get(tenantId)) return this.clients.get(tenantId);

    const authDir = this.createAuthDir(tenantId);
    console.log(`\n${'='.repeat(70)}\n🔧 Inicializando sessão: ${tenant.name} (${tenant.slug})\n🆔 ${tenantId}\n📂 ${authDir}\n${'='.repeat(70)}`);

    // Determinar o caminho do executável do Chrome/Chromium
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || 
                         process.env.CHROME_BIN || 
                         process.env.CHROMIUM_PATH ||
                         '/usr/bin/chromium';
    
    console.log(`🌐 Puppeteer executablePath: ${chromiumPath}`);

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `tenant_${tenantId}`, dataPath: authDir }),
      puppeteer: {
        headless: true,
        executablePath: chromiumPath, // Especifica explicitamente o caminho
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage', 
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions'
        ],
        timeout: 60000,
      },
      qrMaxRetries: 10,
    });

    client.on('qr', async (qr) => {
      this.status.set(tenantId, 'qr_code');
      // Tenta gerar DataURL (se lib qrcode estiver instalada). Caso contrário, guarda raw.
      try {
        const qrcode = require('qrcode');
        const dataURL = await qrcode.toDataURL(qr);
        this.qrCache.set(tenantId, { raw: qr, dataURL });
      } catch (_) {
        this.qrCache.set(tenantId, { raw: qr });
      }
      console.log(`📱 QR atualizado para ${tenant.slug}`);
    });

    client.on('authenticated', () => {
      this.status.set(tenantId, 'authenticated');
      console.log(`🔐 ${tenant.slug}: autenticado`);
    });

    client.on('ready', () => {
      this.status.set(tenantId, 'online');
      this.qrCache.delete(tenantId);
      console.log(`✅ ${tenant.slug}: CONECTADO`);
    });

    client.on('auth_failure', (m) => {
      this.status.set(tenantId, 'auth_failure');
      console.error(`❌ ${tenant.slug}: falha autenticação`, m);
    });

    client.on('disconnected', (reason) => {
      this.status.set(tenantId, 'offline');
      console.warn(`🔌 ${tenant.slug}: desconectado (${reason}) – tentando reiniciar em 10s`);
      setTimeout(() => client.initialize().catch(() => {}), 10000);
    });

    this.clients.set(tenantId, client);
    this.status.set(tenantId, 'initializing');

    try {
      await client.initialize();
    } catch (e) {
      this.status.set(tenantId, 'error');
      console.error(`💥 Erro ao iniciar ${tenant.slug}:`, e.message);
    }

    return client;
  }

  async getOnlineClient(tenantId) {
    const client = this.clients.get(tenantId);
    const stat = this.status.get(tenantId);
    if (!client || stat !== 'online') return null;
    try {
      const s = await client.getState();
      return s === 'CONNECTED' ? client : null;
    } catch (_) {
      return null;
    }
  }

  getAllStatus() {
    const out = {};
    for (const [tenantId] of this.clients) {
      out[tenantId] = { status: this.status.get(tenantId) || 'unknown' };
    }
    return out;
  }

  getTenantStatus(tenantId) {
    return { status: this.status.get(tenantId) || 'not_found' };
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

  // ====== Middleware: resolve tenant por header/body ======
  app.use((req, _res, next) => {
    let tenantId =
      req.headers['x-tenant-id'] ||
      req.headers['X-Tenant-Id'] ||
      req.query.tenant_id ||
      (req.body && req.body.tenant_id);

    if (tenantId) {
      tenantId = String(tenantId).split(',')[0].trim();
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuid.test(tenantId)) req.tenantId = tenantId;
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
    res.json({ ok: true, tenantId: req.params.tenantId, ...tenantManager.getTenantStatus(req.params.tenantId) });
  });

  // ====== QR do tenant resolvido ======
  app.get('/qr', (req, res) => {
    if (!req.tenantId) return res.status(400).json({ ok: false, error: 'Tenant não resolvido' });
    const entry = tenantManager.qrCache.get(req.tenantId);
    if (!entry) return res.status(204).end();
    res.json({ ok: true, tenantId: req.tenantId, qr: entry.raw, qrDataURL: entry.dataURL || null });
  });

  // ====== Conectar (força iniciar sessão) ======
  app.post('/connect', async (req, res) => {
    try {
      if (!req.tenantId) return res.status(400).json({ ok: false, error: 'Tenant não resolvido' });
      let t = await SupabaseHelper.resolveTenantById(req.tenantId);
      if (!t) return res.status(404).json({ ok: false, error: 'Tenant não encontrado ou inativo' });
      await tenantManager.createClient(t);
      res.json({ ok: true, tenantId: req.tenantId, status: tenantManager.getTenantStatus(req.tenantId).status });
    } catch (e) {
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

      // Tenta cliente online
      let client = await tenantManager.getOnlineClient(req.tenantId);
      if (!client) {
        // lazy start
        const t = await SupabaseHelper.resolveTenantById(req.tenantId);
        if (!t) return res.status(404).json({ ok: false, error: 'Tenant não encontrado ou inativo' });
        await tenantManager.createClient(t);
        client = await tenantManager.getOnlineClient(req.tenantId);
        if (!client) {
          // pode estar em QR / initializing
          const s = tenantManager.getTenantStatus(req.tenantId).status;
          return res.status(503).json({ ok: false, error: 'WhatsApp não conectado', status: s });
        }
      }

      const normalized = normalizePhoneBR(to);
      const chatId = `${normalized}@c.us`;
      await client.sendMessage(chatId, message);
      SupabaseHelper.logMessage(req.tenantId, normalized, message, 'outgoing').catch(() => {});
      res.json({ ok: true, tenantId: req.tenantId, to: normalized });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ====== 404 ======
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada' }));

  return app;
}

// ===================== Bootstrap =====================
async function main() {
  console.log(`\n${'='.repeat(70)}\n🚀 WhatsApp Multi‑Tenant – v4.1 (lazy sessions)\nAuth: ${CONFIG.AUTH_DIR}\nPort: ${CONFIG.PORT}\n${'='.repeat(70)}\n`);
  const manager = new TenantManager();
  const app = await createApp(manager);
  app.listen(CONFIG.PORT, () => console.log(`▶️  HTTP ${CONFIG.PORT}`));
}

main().catch((e) => {
  console.error('❌ Erro fatal:', e);
  process.exit(1);
});

/*
========================================
.env exemplo (Railway Variables)
========================================
PORT=8080
AUTH_DIR=/data/.wwebjs_auth
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
*/
