/**
 * server-whatsapp.js — WhatsApp bot (broadcast + webhooks) — versão final
 * Node 18+ | whatsapp-web.js | express | express-fileupload | cors | qrcode-terminal
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const qrcode = require('qrcode-terminal');

// fetch (fallback para ambientes sem global)
if (typeof fetch !== 'function') {
  global.fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
}

/* ============================ ENV / CONFIG ============================ */
const PORT = process.env.PORT || 3333;

// Supabase (configurações do projeto atual)
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

// tabelas/campos (configurações para o projeto atual)
const ORDERS_TABLE = 'orders';
const ORDER_PHONE_FIELD = 'customer_phone';
const ORDER_PAID_FIELD = 'is_paid';

// Multi-tenant configuration
let tenantsCache = {};
let tenantsCacheTime = 0;
const TENANTS_CACHE_TTL = 60000; // 1 minute

// segredos
const BROADCAST_SECRET = process.env.BROADCAST_SECRET || 'whatsapp-broadcast-2024';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'whatsapp-webhook-2024';

// sessão do WhatsApp
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const WIPE_SESSION = process.env.WIPE_WWEB_SESSION === 'true';

// instâncias (separadas por vírgula)
const INSTANCE_NAMES = (process.env.WPP_INSTANCES || 'instancia1')
  .split(',').map(s => s.trim()).filter(Boolean);

// controle de labels (pode desabilitar via env)
const DISABLE_LABELS = process.env.DISABLE_LABELS === 'true';
const MASS_BROADCAST_LABEL = process.env.MASS_BROADCAST_LABEL || 'APP';

// (opcional) Forçar versão remota do WA Web — use SOMENTE se souber o que está fazendo
const WEB_VERSION_REMOTE = process.env.WEB_VERSION_REMOTE || '';

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const digits = (s) => String(s || '').replace(/\D/g, '');
function withBR(s) { const n = digits(s); return n.startsWith('55') ? n : `55${n}`; }
function fmtMoney(v) { return `R$ ${Number(v||0).toFixed(2).replace('.', ',')}`; }

/**
 * Normaliza número de telefone brasileiro para WhatsApp
 * - Remove caracteres não numéricos
 * - Adiciona DDI 55 se necessário
 * - Ajusta 9º dígito conforme regra do DDD:
 *   DDD ≤ 30: Celular DEVE ter 9º dígito (11 dígitos)
 *   DDD ≥ 31: Celular NÃO deve ter 9º dígito (10 dígitos)
 */
function normalizeDDD(phone) {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  let clean = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Validação básica
  if (clean.length < 10 || clean.length > 11) {
    console.warn('⚠️ Telefone com tamanho inválido para envio WhatsApp:', phone);
    return '55' + clean;
  }
  
  const ddd = parseInt(clean.substring(0, 2));
  
  // Validar DDD
  if (ddd < 11 || ddd > 99) {
    console.warn('⚠️ DDD inválido:', ddd);
    return '55' + clean;
  }
  
  // REGRA POR DDD para envio WhatsApp:
  if (ddd <= 30) {
    // DDDs antigos (≤30): adicionar 9º dígito se não tiver
    if (clean.length === 10 && clean[2] !== '9') {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log('✅ 9º dígito adicionado para WhatsApp (DDD ≤30):', phone, '->', clean);
    }
  } else {
    // DDDs novos (≥31): remover 9º dígito se tiver
    if (clean.length === 11 && clean[2] === '9') {
      clean = clean.substring(0, 2) + clean.substring(3);
      console.log('✅ 9º dígito removido para WhatsApp (DDD ≥31):', phone, '->', clean);
    }
  }
  
  // Adicionar DDI 55
  return '55' + clean;
}

// log curto
const LOGS_LIMIT = 1000;
const MSG_STATUS_LIMIT = 1000;
function pushLog(arr, obj, cap = LOGS_LIMIT) { arr.unshift({ date: new Date().toISOString(), ...obj }); if (arr.length > cap) arr.splice(cap); }

/* ======================= Sessão e Browser path ======================= */
if (WIPE_SESSION && fs.existsSync(AUTH_DIR)) {
  console.log('🧹 Limpando sessão anterior (WIPE_WWEB_SESSION=true)...');
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
} else {
  console.log('🔐 Mantendo sessão (defina WIPE_WWEB_SESSION=true para limpar).');
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  for (const p of candidates) try { if (fs.existsSync(p)) return p; } catch {}
  return null;
}
const BROWSER_EXEC = resolveBrowserExecutable();

/* ============================ Safe LocalAuth ============================ */
class SafeLocalAuth extends LocalAuth {
  async logout() {
    try { await super.logout(); }
    catch (e) {
      if ((e.code === 'EBUSY' || e.code === 'EPERM') && String(e?.message||'').includes('.wwebjs_auth')) {
        console.warn('🛡️ SafeLocalAuth: EBUSY/EPERM — mantendo pasta para evitar crash.');
        return;
      }
      throw e;
    }
  }
}
for (const evt of ['uncaughtException','unhandledRejection']) {
  process.on(evt, (err) => {
    const e = err?.reason || err;
    if (e && (e.code === 'EBUSY' || e.code === 'EPERM') && String(e?.message||'').includes('.wwebjs_auth')) {
      console.warn(`🛡️ Ignorando ${evt} do LocalAuth:`, e.message || e);
      return;
    }
    console.error(`❗ ${evt}:`, err);
  });
}

/* ============================ App ============================ */
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(fileUpload());
app.use(express.static('public'));
app.use(cors());

// Apply tenant middleware to all routes
app.use(tenantMiddleware);

/* ============================ Estado ============================ */
const clients = {};                 // name -> Client
const instStatus = {};              // name -> 'offline'|'qr_code'|'authenticated'|'online'|'auth_failure'
const instNumber = {};              // name -> wid.user
let rrIndex = 0;                    // round robin
const logs = [];
const messageStatus = [];
const clientResponses = [];

// duplicidade básica
const DUP_TTL = 10 * 60 * 1000;
const sentMap = new Map();
const inQueue = new Set();
function keyFor(num, msg) { return `${digits(num)}-${Buffer.from(String(msg||'').trim().toLowerCase()).toString('base64')}`; }
function dupBlocked(num, msg) {
  const k = keyFor(num, msg), now = Date.now();
  if (inQueue.has(k)) return true;
  const last = sentMap.get(k);
  if (last && now - last < DUP_TTL) return true;
  inQueue.add(k); return false;
}
function markSent(num, msg) {
  const k = keyFor(num, msg);
  sentMap.set(k, Date.now()); inQueue.delete(k);
  if (sentMap.size > 5000) {
    const cut = Date.now() - DUP_TTL;
    for (const [kk, ts] of sentMap) if (ts < cut) sentMap.delete(kk);
  }
}

/* ============================ Monitor/Availability ============================ */
async function isConnected(c) { try { return (await c.getState()) === 'CONNECTED'; } catch { return false; } }

function getAvailableInstance() {
  const avail = INSTANCE_NAMES.filter(n => clients[n] && instStatus[n] === 'online');
  if (!avail.length) { console.log('⚠️ Nenhuma instância disponível no momento'); return null; }
  const pick = avail[rrIndex % avail.length]; rrIndex++;
  console.log(`🔄 ROUND-ROBIN: ${pick} (${(rrIndex % avail.length)+1}/${avail.length})`);
  return pick;
}

async function waitUntilOnline(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const n = getAvailableInstance();
    if (n && await isConnected(clients[n])) return n;
    await delay(1000);
  }
  return null;
}

/* ============================ Injeção WA Web (anti getChat) ============================ */
async function ensureWAInjected(client, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const chats = await client.getChats(); // depende da injeção
      if (Array.isArray(chats)) return true;
    } catch {}
    await delay(1000);
  }
  return false;
}
function isGetChatInjectionError(err) {
  const msg = String((err && err.message) || err || '');
  // sinais típicos quando a injeção ainda não subiu:
  return msg.includes('getChat') || msg.includes('pptr://__puppeteer_evaluation_script__');
}

/* ============================ Multi-tenant helpers ============================ */
async function loadTenants() {
  const now = Date.now();
  if (now - tenantsCacheTime < TENANTS_CACHE_TTL && Object.keys(tenantsCache).length > 0) {
    return tenantsCache;
  }

  try {
    const integrations = await supaRaw('/integration_whatsapp?select=tenant_id,api_url,is_active&is_active=eq.true');
    tenantsCache = {};
    integrations.forEach(row => {
      if (row.api_url) {
        // Extract path from WhatsApp API URL to use as identifier
        const url = new URL(row.api_url);
        const pathKey = url.pathname.replace(/^\/+|\/+$/g, '');
        if (pathKey) {
          tenantsCache[pathKey] = { id: row.tenant_id, slug: pathKey, api_url: row.api_url };
        }
      }
    });
    tenantsCacheTime = now;
    console.log('🏢 Tenants carregados:', Object.keys(tenantsCache));
    return tenantsCache;
  } catch (error) {
    console.error('❌ Erro ao carregar tenants:', error);
    return tenantsCache; // Return cached version on error
  }
}

function getTenantFromRequest(req) {
  // Extract tenant from URL path (e.g., /tenant1/api/send -> tenant1)
  const pathParts = req.path.split('/').filter(Boolean);
  if (pathParts.length > 0) {
    const tenantKey = pathParts[0];
    return tenantsCache[tenantKey] || null;
  }
  return null;
}

// Middleware to identify tenant and attach to request
async function tenantMiddleware(req, res, next) {
  try {
    await loadTenants();
    req.tenant = getTenantFromRequest(req);
    next();
  } catch (error) {
    console.error('❌ Erro no middleware tenant:', error);
    next(); // Continue without tenant for backward compatibility
  }
}

/* ============================ Supabase helper ============================ */
async function supaRaw(pathname, init) {
  const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1${pathname}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init && init.headers) } });
  if (!res.ok) throw new Error(`Supabase ${res.status} ${pathname} ${await res.text()}`);
  return res.json();
}

async function supa(pathname, init, tenantId = null) {
  // Add tenant filter if tenant is provided
  if (tenantId) {
    const separator = pathname.includes('?') ? '&' : '?';
    pathname += `${separator}tenant_id=eq.${tenantId}`;
  }
  return supaRaw(pathname, init);
}

/* ============================ Templates WhatsApp ============================ */
let whatsappTemplatesCache = {};
let templatesCacheTime = 0;

async function getWhatsAppTemplate(type, tenantId = null) {
  const cacheKey = `${type}-${tenantId || 'default'}`;
  const now = Date.now();
  // Cache por 5 minutos
  if (now - templatesCacheTime > 300000) {
    try {
      const templates = await supa('/whatsapp_templates?select=*', null, tenantId);
      whatsappTemplatesCache = {};
      templates.forEach(t => whatsappTemplatesCache[`${t.type}-${t.tenant_id || 'default'}`] = t);
      templatesCacheTime = now;
    } catch (e) {
      console.error('Erro ao buscar templates:', e.message);
    }
  }
  return whatsappTemplatesCache[cacheKey] || null;
}

function replaceTemplateVariables(template, variables) {
  if (!template) return '';
  let result = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, variables[key] || '');
  });
  return result;
}
async function getPhonesByStatus(status, tenantId = null) {
  // status: 'paid' | 'unpaid' | 'all'
  let qs = `/${ORDERS_TABLE}?select=${ORDER_PHONE_FIELD},${ORDER_PAID_FIELD}&${ORDER_PHONE_FIELD}=not.is.null`;
  if (status === 'paid')   qs += `&${ORDER_PAID_FIELD}=eq.true`;
  if (status === 'unpaid') qs += `&${ORDER_PAID_FIELD}=eq.false`;
  const rows = await supa(qs, null, tenantId);
  const out = new Set(rows.map(r => digits(r[ORDER_PHONE_FIELD])).filter(Boolean));
  return Array.from(out);
}

// ========================== Supabase domain helpers ==========================
function dbPhoneFormat(num) {
  return normalizeDDD(num);
}

async function findProductByCode(raw, tenantId = null) {
  const code = String(raw || '').trim().toUpperCase();
  const numeric = code.replace(/^C/i, '');
  const or = encodeURIComponent(`code.eq.${code},code.eq.${numeric}`);
  const rows = await supa(`/products?select=id,code,name,price,stock,is_active&is_active=eq.true&or=(${or})&limit=1`, null, tenantId);
  return rows?.[0] || null;
}

async function getOrCreateCartAndOrder(phone, eventDate, eventType = 'Manual', tenantId = null) {
  // 1) Buscar pedido em aberto (não pago) do dia
  const q = `/${ORDERS_TABLE}?select=id,cart_id,total_amount&${ORDER_PHONE_FIELD}=eq.${phone}&event_date=eq.${eventDate}&is_paid=eq.false&limit=1`;
  const existing = await supa(q, null, tenantId);
  let order = existing?.[0] || null;
  let cart = null;

  if (order) {
    // Garantir cart
    if (!order.cart_id) {
      const createdCart = await supa('/carts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ event_date: eventDate, customer_phone: phone, event_type: eventType, status: 'OPEN', tenant_id: tenantId })
      }, tenantId);
      cart = createdCart?.[0] || null;
      const upd = await supa(`/orders?id=eq.${order.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cart_id: cart?.id })
      }, tenantId);
      order = upd?.[0] || order;
    } else {
      const foundCart = await supa(`/carts?id=eq.${order.cart_id}&select=id,event_date,customer_phone,event_type,status&limit=1`, null, tenantId);
      cart = foundCart?.[0] || null;
    }
  } else {
    // Criar cart e pedido
    const createdCart = await supa('/carts', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ event_date: eventDate, customer_phone: phone, event_type: eventType, status: 'OPEN', tenant_id: tenantId })
    }, tenantId);
    cart = createdCart?.[0] || null;

    const createdOrder = await supa('/orders', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ cart_id: cart?.id || null, event_date: eventDate, total_amount: 0, is_paid: false, [ORDER_PHONE_FIELD]: phone, event_type: eventType, tenant_id: tenantId })
    }, tenantId);
    order = createdOrder?.[0] || null;
  }

  if (!order) throw new Error('FALHA_CRIAR_PEDIDO');
  if (!cart) {
    const found = await supa(`/carts?id=eq.${order.cart_id}&select=id&limit=1`, null, tenantId);
    cart = found?.[0] || null;
  }
  return { order, cart };
}

async function addOrUpdateCartItem(cartId, productId, qty, unitPrice, tenantId = null) {
  const exists = await supa(`/cart_items?select=id,qty&cart_id=eq.${cartId}&product_id=eq.${productId}&limit=1`, null, tenantId);
  if (exists?.[0]) {
    const id = exists[0].id;
    const newQty = Number(exists[0].qty || 0) + Number(qty || 1);
    const upd = await supa(`/cart_items?id=eq.${id}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ qty: newQty })
    }, tenantId);
    return upd?.[0] || { id };
  }
  const ins = await supa('/cart_items', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ cart_id: cartId, product_id: productId, qty: qty || 1, unit_price: unitPrice, printed: false, tenant_id: tenantId })
  }, tenantId);
  return ins?.[0];
}

async function updateProductStock(productId, currentStock, qty, tenantId = null) {
  const newStock = Math.max(0, Number(currentStock || 0) - Number(qty || 1));
  await supa(`/products?id=eq.${productId}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ stock: newStock })
  }, tenantId);
  return newStock;
}

async function processProductCodeForPhone(instName, client, phoneRaw, codeRaw, qty = 1, groupName = null, tenantId = null) {
  const phone = dbPhoneFormat(phoneRaw);
  const product = await findProductByCode(codeRaw, tenantId);
  if (!product) throw new Error(`PRODUTO_NAO_ENCONTRADO_${codeRaw}`);

  const eventDate = new Date().toISOString().slice(0,10);
  const { order, cart } = await getOrCreateCartAndOrder(phone, eventDate, 'Manual', tenantId);

  // adicionar item
  await addOrUpdateCartItem(cart.id, product.id, qty, product.price, tenantId);

  // atualizar total do pedido
  const novoTotal = Number(order.total_amount || 0) + Number(product.price || 0) * Number(qty || 1);
  await supa(`/orders?id=eq.${order.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ total_amount: novoTotal, whatsapp_group_name: groupName || null })
  }, tenantId);

  // atualizar estoque
  await updateProductStock(product.id, product.stock, qty, tenantId);

  // registrar grupo do cliente (upsert)
  try {
    if (groupName) {
      await supa('/customer_whatsapp_groups', {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({ customer_phone: phone, whatsapp_group_name: groupName, tenant_id: tenantId })
      }, tenantId);
    }
  } catch {}

  // log opcional em whatsapp_messages
  try {
    await supa('/whatsapp_messages', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ phone, message: `Item ${product.name} (${product.code}) adicionado automaticamente`, type: 'item_added', order_id: order.id, product_name: product.name, amount: product.price, whatsapp_group_name: groupName || null, tenant_id: tenantId })
    }, tenantId);
  } catch {}

  // enviar confirmação ao cliente
  const text = await composeItemAdded({ product: { name: product.name, code: product.code, qty, price: Number(product.price || 0) } }, tenantId);
  const messageId = `${instName}-${phone}-${Date.now()}`;
  await sendSingleMessage(instName, client, phone, text, null, messageId);

  return { orderId: order.id, cartId: cart.id, product };
}

/* ============================ WhatsApp client factory ============================ */
function createClient(name) {
  const cfg = {
    authStrategy: new SafeLocalAuth({ clientId: name, dataPath: AUTH_DIR }),
    puppeteer: {
      headless: false,
      executablePath: BROWSER_EXEC || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--start-maximized',
        '--disable-features=VizDisplayCompositor'
      ],
      timeout: 120000
    },
    qrMaxRetries: 3,
    takeoverOnConflict: true
  };

  // Só aplica webVersionCache se houver URL em env (padrão: desligado)
  if (WEB_VERSION_REMOTE) {
    cfg.webVersionCache = { type: 'remote', remotePath: WEB_VERSION_REMOTE };
  }

  const client = new Client(cfg);

  client.on('qr', (qr) => {
    instStatus[name] = 'qr_code';
    try { qrcode.generate(qr, { small:true }); } catch {}
    pushLog(logs, { inst: name, evt: 'qr' });
  });
  client.on('authenticated', () => { instStatus[name] = 'authenticated'; pushLog(logs, { inst: name, evt: 'authenticated' }); });
  client.on('auth_failure', (m) => { instStatus[name] = 'auth_failure'; pushLog(logs, { inst: name, evt: 'auth_failure', msg: m }); });
  client.on('change_state', (st) => {
    if (st === 'CONNECTED') {
      instStatus[name] = 'online';
      instNumber[name] = client?.info?.wid?.user || instNumber[name];
    }
  });
  client.on('ready', () => {
    instStatus[name] = 'online';
    instNumber[name] = client?.info?.wid?.user || instNumber[name];
    pushLog(logs, { inst: name, evt: 'ready', wid: instNumber[name]||null });
  });
  client.on('disconnected', (why) => {
    instStatus[name] = 'offline';
    instNumber[name] = null;
    try { client.destroy(); } catch {}
    delete clients[name];
    pushLog(logs, { inst: name, evt: 'disconnected', why });
  });

  // recebidas confiáveis
  client.on('message', onIncoming(name, client));

  client.on('message_ack', (msg, ack) => {
    const map = {0:'pendente',1:'enviado',2:'entregue',3:'lido',4:'visualizado'};
    const status = map[ack] || 'desconhecido';
    const numero = (msg.to || '').replace('@c.us','');
    messageStatus.push({ messageId: msg.id.id || `${name}-${numero}-${Date.now()}`, numero, status, instancia: name, timestamp: new Date().toISOString(), sentAt: new Date().toISOString() });
    if (messageStatus.length > MSG_STATUS_LIMIT) messageStatus.splice(MSG_STATUS_LIMIT);
  });

  return client;
}

function onIncoming(instName, client) {
  return async (msg) => {
    if (msg.fromMe) return;
    const dt = new Date((msg.timestamp||Date.now()/1000) * 1000);
    if (Date.now() - dt.getTime() > 2*24*60*60*1000) return;

    let numero = (msg.from||'').replace('@c.us','');
    try { const c = await msg.getContact(); numero = c?.number || numero; } catch {}
    
    // Ignorar mensagens da própria instância conectada (553182558687)
    const cleanNumber = numero.replace(/\D/g, '');
    if (cleanNumber === '553182558687' || cleanNumber === '5531982558687') return;
    
    const texto = String(msg.body||'').trim();

    pushLog(clientResponses, { numero, mensagem: texto, instancia: instName, when: dt.toISOString() });

    // Processar códigos de produto no formato C123 (case-insensitive)
    const tokens = Array.from(new Set((texto.match(/c\d+/gi) || []).map(t => t.toUpperCase())));
    if (!tokens.length) return;

    // Tentar obter nome do grupo (se a mensagem veio de um grupo)
    let groupName = null;
    try {
      const chat = await msg.getChat();
      if (chat && chat.isGroup && chat.name) {
        groupName = String(chat.name);
      }
    } catch {}

    for (const token of tokens) {
      try {
        await processProductCodeForPhone(instName, client, numero, token, 1, groupName);
      } catch (e) {
        console.warn('auto-venda erro', token, e.message);
        try {
          const wid = await getWidOrNull(client, numero);
          if (wid) {
            const friendly = String(e?.message||'')?.startsWith('PRODUTO_NAO_ENCONTRADO')
              ? `Não encontrei o produto ${token}. Verifique o código.`
              : ''; // Removendo mensagem de erro genérica
            if (friendly) {
              await client.sendMessage(wid, friendly);
            }
          }
        } catch {}
      }
    }
  };
}

/* ============================ Inicialização ============================ */
INSTANCE_NAMES.forEach(name => {
  try {
    const c = createClient(name);
    clients[name] = c; instStatus[name] = 'offline'; instNumber[name] = null;
    c.initialize().catch(e => { instStatus[name] = 'offline'; pushLog(logs, { inst: name, evt:'init_error', msg:e.message }); });

    // reconciliação leve
    const t = setInterval(async () => {
      if (!clients[name]) return clearInterval(t);
      if (instStatus[name] === 'online') return clearInterval(t);
      const s = await clients[name].getState().catch(()=>null);
      if (s === 'CONNECTED') {
        instStatus[name] = 'online';
        instNumber[name] = clients[name]?.info?.wid?.user || instNumber[name];
        pushLog(logs, { inst:name, evt:'reconciled', wid:instNumber[name]||null });
        clearInterval(t);
      }
    }, 5000);
  } catch (e) { instStatus[name] = 'offline'; pushLog(logs, { inst: name, evt:'factory_error', msg:e.message }); }
});

/* ============================ Helpers de envio ============================ */
async function getWidOrNull(client, numero) {
  const normalizedNumber = normalizeDDD(numero);
  let wid = await client.getNumberId(normalizedNumber).catch(()=>null);
  return wid && wid._serialized ? wid._serialized : null;
}

async function addLabelIfNeeded(client, toWid, labelName) {
  if (!labelName || DISABLE_LABELS) return;
  try {
    const labels = await client.getLabels();
    let target = labels.find(l => l.name === labelName);
    if (!target) target = await client.createLabel(labelName);
    const chat = await client.getChatById(toWid);
    await chat.addLabel(target.id);
  } catch (e) {
    console.warn('label warn:', e.message);
  }
}

let CURRENT_MASS_LABEL = null; // usado no broadcast

async function sendSingleMessage(instanceName, client, numero, mensagem, imgPath, messageId) {
  const state = await client.getState().catch(()=>null);
  if (state !== 'CONNECTED') throw new Error('CLIENTE_NAO_CONECTADO');

  // garantia extra: injeção do WA Web carregada (não bloquear envio se não ficar pronta)
  const injected = await ensureWAInjected(client, 20000).catch(() => false);
  if (!injected) {
    console.warn('WA injection not ready, tentando envio mesmo assim...');
  }

  const normalizedNumber = normalizeDDD(numero);
  const toWid = await getWidOrNull(client, normalizedNumber);
  if (!toWid) throw new Error('NUMERO_NAO_WHATSAPP');

  try {
    if (imgPath && fs.existsSync(imgPath)) {
      const media = MessageMedia.fromFilePath(imgPath);
      await client.sendMessage(toWid, media, { caption: mensagem });
    } else {
      await client.sendMessage(toWid, mensagem);
    }
    await addLabelIfNeeded(client, toWid, CURRENT_MASS_LABEL);
  } catch (err) {
    // se for erro clássico de injeção, aguarda e tenta 1x
    if (isGetChatInjectionError(err)) {
      console.warn('⚠️ getChat undefined: aguardando injeção e tentando novamente...');
      await ensureWAInjected(client, 15000);
      if (imgPath && fs.existsSync(imgPath)) {
        const media = MessageMedia.fromFilePath(imgPath);
        await client.sendMessage(toWid, media, { caption: mensagem });
      } else {
        await client.sendMessage(toWid, mensagem);
      }
      await addLabelIfNeeded(client, toWid, CURRENT_MASS_LABEL);
    } else {
      throw err;
    }
  }

  pushLog(logs, { inst: instanceName, numero: digits(numero), msg: mensagem, status: 'sent' });
  messageStatus.push({ messageId, numero: digits(numero), status: 'enviado', instancia: instanceName, timestamp: new Date().toISOString(), sentAt: new Date().toISOString() });
  if (messageStatus.length > MSG_STATUS_LIMIT) messageStatus.splice(MSG_STATUS_LIMIT);
}

async function processBatch({ numeros, mensagens, interval=2000, batchSize=5, batchDelay=3000, imgPath=null }) {
  // espera ficar online
  const first = await waitUntilOnline(30000);
  if (!first) { console.log('⏳ Nenhuma instância ONLINE após 30s. Abortando lote.'); return; }

  let ok = 0, dup = 0, err = 0, redist = 0, msgIdx = 0, lot = 0;

  for (let i=0;i<numeros.length;i++) {
    const numero = numeros[i];
    const mensagem = mensagens[msgIdx];
    msgIdx = (msgIdx+1) % mensagens.length;

    if (dupBlocked(numero, mensagem)) { dup++; continue; }

    let sent = false, tries = 0;
    while (!sent && tries < 3) {
      const inst = getAvailableInstance();
      if (!inst) { await delay(5000); tries++; continue; }
      const client = clients[inst];
      if (!(await isConnected(client))) { tries++; await delay(1500); continue; }

      const messageId = `${inst}-${numero}-${Date.now()}`;
      try {
        await sendSingleMessage(inst, client, numero, mensagem, imgPath, messageId);
        markSent(numero, mensagem);
        ok++; sent = true; await delay(interval);
      } catch (e) {
        console.error(`❌ ERRO ${inst} → ${numero}:`, e.message);
        if (e.message?.includes('Session') || e.message?.includes('Protocol error')) { instStatus[inst] = 'offline'; redist++; }
        tries++; await delay(1500);
      }
    }

    if (!sent) { err++; inQueue.delete(keyFor(numero, mensagem)); pushLog(logs, { inst:'N/A', numero, msg: mensagem, status:'erro_final' }); }
    lot++; if (lot >= batchSize) { await delay(batchDelay); lot = 0; }
  }

  console.log(`🎉 CONCLUÍDO — Sucessos: ${ok}/${numeros.length} | Duplicatas: ${dup} | Redistribuições: ${redist} | Erros: ${err}`);
}

/* ============================ API — status/debug ============================ */
app.get('/api/status', (_req,res)=> {
  res.json({ instancias: INSTANCE_NAMES.map(n => ({ nome:n, status: instStatus[n]||'offline', numero: instNumber[n]||null })) });
});
app.get('/api/logs',   (_req,res)=> res.json({ logs }));
app.get('/api/message-status', (_req,res)=> res.json({ messageStatus }));
app.get('/api/client-responses', (_req,res)=> res.json({ responses: clientResponses }));

// Compat: recebe payload anterior do front { data: stringifiedJSON }
app.post('/api/send-config', async (req, res) => {
  try {
    const payload = typeof req.body?.data === 'string' ? JSON.parse(req.body.data) : (req.body?.data || req.body || {});
    const { numeros = [], mensagens = [], interval = 2000, batchSize = 5, batchDelay = 3000, key } = payload;

    // autorização opcional (usa o mesmo segredo do broadcast se enviado)
    const k = req.get('x-api-key') || key || req.body?.key;
    if (k && k !== BROADCAST_SECRET) return res.status(401).json({ error: 'unauthorized' });

    const nums = (numeros || []).map(digits).filter(Boolean);
    const msgs = (mensagens || []).filter(Boolean);
    if (!nums.length || !msgs.length) return res.status(400).json({ error: 'numeros[] e mensagens[] são obrigatórios' });

    CURRENT_MASS_LABEL = MASS_BROADCAST_LABEL;
    res.json({ ok: true, total: nums.length });

    (async () => {
      try {
        await processBatch({
          numeros: nums,
          mensagens: msgs,
          interval: Math.max(500, interval),
          batchSize: Math.max(1, Math.min(50, batchSize)),
          batchDelay: Math.max(1000, batchDelay),
          imgPath: null
        });
      } finally { CURRENT_MASS_LABEL = null; }
    })();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================ API — Broadcast ============================ */
// 1) por lista de telefones
app.post('/api/broadcast/by-phones', async (req, res) => {
  try {
    const key = req.get('x-api-key') || req.body?.key;
    if (key !== BROADCAST_SECRET) return res.status(401).json({ error: 'unauthorized' });

    const { phones, message, interval, batchSize, batchDelay } = req.body || {};
    const numeros = (phones||[]).map(digits).filter(Boolean);
    if (!numeros.length || !message) return res.status(400).json({ error: 'phones[] e message são obrigatórios' });

    CURRENT_MASS_LABEL = MASS_BROADCAST_LABEL;
    res.json({ ok: true, total: numeros.length });

    (async () => {
      try {
        await processBatch({
          numeros, mensagens: [message],
          interval: Math.max(500, interval || 2000),
          batchSize: Math.max(1, Math.min(50, batchSize || 5)),
          batchDelay: Math.max(1000, batchDelay || 3000),
          imgPath: null
        });
      } finally {
        CURRENT_MASS_LABEL = null;
      }
    })();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2) por status de pedido (paid/unpaid/all) — lê phones do Supabase
app.post('/api/broadcast/orders', async (req, res) => {
  try {
    const key = req.get('x-api-key') || req.body?.key;
    if (key !== BROADCAST_SECRET) return res.status(401).json({ error: 'unauthorized' });

    const { status='all', message, interval, batchSize, batchDelay } = req.body || {};
    const tenantId = req.tenant?.id || null;
    
    let finalMessage = message;
    // Se não foi fornecida uma mensagem, usar template BROADCAST
    if (!message) {
      const template = await getWhatsAppTemplate('BROADCAST', tenantId);
      if (template) {
        finalMessage = template.content;
      } else {
        return res.status(400).json({ error: 'message é obrigatório e template BROADCAST não encontrado' });
      }
    }

    const phones = await getPhonesByStatus(status, tenantId);
    if (!phones.length) return res.json({ ok: true, total: 0, note: 'nenhum telefone encontrado' });

    CURRENT_MASS_LABEL = MASS_BROADCAST_LABEL;
    (async () => {
      try {
        await processBatch({
          numeros: phones, mensagens: [finalMessage],
          interval: Number(interval) || 2000,
          batchSize: Number(batchSize) || 5,
          batchDelay: Number(batchDelay) || 3000,
          imgPath: null
        });
      } finally { CURRENT_MASS_LABEL = null; }
    })();
    res.json({ ok: true, total: phones.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================ API — Webhooks ============================ */
function verifyWebhook(req) {
  const h = req.get('x-webhook-secret') || req.query.secret || req.body?.secret;
  if (h !== WEBHOOK_SECRET) throw new Error('unauthorized');
}
  async function composeOrderCreated(b, tenantId = null) {
    const template = await getWhatsAppTemplate('ORDER_CREATED', tenantId);
    if (template) {
      return replaceTemplateVariables(template.content, {
        customer_name: b?.customer_name || 'Cliente',
        order_id: b?.order_id || b?.id || '',
        total_amount: fmtMoney(b?.total_amount)
      });
    }
    // Fallback se não houver template
    const nome = b?.customer_name || 'Cliente';
    const total = fmtMoney(b?.total_amount);
    const id = b?.order_id || b?.id || '';
    return `🧾 *Pedido criado!*\n\nOlá ${nome} 👋\nSeu pedido *#${id}* foi registrado com sucesso.\n\nTotal: *${total}*\n\nQualquer dúvida é só responder aqui.`;
  }
async function composeItemAdded(b, tenantId = null) {
  const template = await getWhatsAppTemplate('ITEM_ADDED', tenantId);
  if (template) {
    const p = b?.product || {};
    return replaceTemplateVariables(template.content, {
      produto: p?.name || 'Item',
      quantidade: p?.qty || 1,
      preco: fmtMoney(p?.price),
      total: fmtMoney((p?.price || 0) * (p?.qty || 1))
    });
  }
  // Fallback se não houver template
  const p = b?.product || {};
  const nome = p?.name || 'Item';
  const cod = p?.code ? ` (${p.code})` : '';
  const qty = p?.qty || 1;
  const price = fmtMoney(p?.price);
  return `🛒 *Item adicionado ao pedido*\n\n✅ ${nome}${cod}\nQtd: *${qty}*\nPreço: *${price}*`;
}
async function composeItemCancelled(b, tenantId = null) {
  const template = await getWhatsAppTemplate('PRODUCT_CANCELED', tenantId);
  if (template) {
    const p = b?.product || {};
    return replaceTemplateVariables(template.content, {
      produto: p?.name || 'Item',
      quantidade: p?.qty || 1,
      valor: fmtMoney(p?.price)
    });
  }
  // Fallback se não houver template
  const p = b?.product || {};
  const nome = p?.name || 'Item';
  const cod = p?.code ? ` (${p.code})` : '';
  const qty = p?.qty || 1;
  return `❌ *Item cancelado*\n\n${nome}${cod}\nQtd: *${qty}* foi removido do seu pedido.`;
}

async function composePaidOrder(b, tenantId = null) {
  const template = await getWhatsAppTemplate('PAID_ORDER', tenantId);
  if (template) {
    return replaceTemplateVariables(template.content, {
      order_id: b?.order_id || b?.id || '',
      total_amount: fmtMoney(b?.total_amount)
    });
  }
  // Fallback se não houver template
  const total = fmtMoney(b?.total_amount);
  const id = b?.order_id || b?.id || '';
  return `🎉 *Pedido Confirmado - #${id}*\n\nSeu pagamento foi confirmado com sucesso! ✅\n\n💰 Valor pago: ${total}\n\n📦 Seu pedido está sendo preparado e em breve entraremos em contato com as informações de entrega.`;
}

async function sendOne(phone, text, tenantId = null) {
  const inst = await waitUntilOnline(30000);
  if (!inst) throw new Error('no_instance_online');
  const client = clients[inst];
  const messageId = `${inst}-${phone}-${Date.now()}`;
  await sendSingleMessage(inst, client, phone, text, null, messageId);
}

// webhooks "oficiais" (com secret)
app.post('/webhooks/order-created', async (req,res) => {
  try { verifyWebhook(req);
    const phone = digits(req.body?.customer_phone||req.body?.phone||'');
    if (!phone) return res.status(400).json({ error: 'phone ausente' });
    const tenantId = req.tenant?.id || null;
    await sendOne(phone, await composeOrderCreated(req.body, tenantId), tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});
app.post('/webhooks/order-item-added', async (req,res) => {
  try { verifyWebhook(req);
    const phone = digits(req.body?.customer_phone||req.body?.phone||'');
    if (!phone) return res.status(400).json({ error: 'phone ausente' });
    const tenantId = req.tenant?.id || null;
    await sendOne(phone, await composeItemAdded(req.body, tenantId), tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});
app.post('/webhooks/order-item-cancelled', async (req,res) => {
  try { verifyWebhook(req);
    const phone = digits(req.body?.customer_phone||req.body?.phone||'');
    if (!phone) return res.status(400).json({ error: 'phone ausente' });
    const tenantId = req.tenant?.id || null;
    await sendOne(phone, await composeItemCancelled(req.body, tenantId), tenantId);
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});

// rotas de teste (sem secret) — para validar integração
app.post('/api/test/order-created', async (req,res)=> {
  try { 
    const phone = digits(req.body?.phone||''); 
    if(!phone) return res.status(400).json({error:'phone'}); 
    const tenantId = req.tenant?.id || null;
    await sendOne(phone, await composeOrderCreated(req.body, tenantId), tenantId); 
    res.json({ok:true}); 
  }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/test/item-added', async (req,res)=> {
  try { 
    const phone = digits(req.body?.phone||''); 
    if(!phone) return res.status(400).json({error:'phone'}); 
    const tenantId = req.tenant?.id || null;
    await sendOne(phone, await composeItemAdded(req.body, tenantId), tenantId); 
    res.json({ok:true}); 
  }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/test/item-cancelled', async (req,res)=> {
  try { 
    const phone = digits(req.body?.phone||''); 
    if(!phone) return res.status(400).json({error:'phone'}); 
    const tenantId = req.tenant?.id || null;
    await sendOne(phone, await composeItemCancelled(req.body, tenantId), tenantId); 
    res.json({ok:true}); 
  }
  catch(e){ res.status(500).json({error:e.message}); }
});

/* ============================ Compat: envio simples & label ============================ */
app.post('/send', async (req,res)=> basicSend(req,res));
app.post('/send-message', async (req,res)=> basicSend(req,res));

async function basicSend(req,res){
  try{
    const { number, to, message } = req.body || {};
    const phone = number || to;
    if (!phone || !message) return res.status(400).json({ success:false, error:'Phone and message are required' });
    if (dupBlocked(phone, message)) return res.status(409).json({ success:false, error:'Duplicate message blocked' });

    const inst = await waitUntilOnline(30000); if(!inst) return res.status(503).json({ success:false, error:'Nenhuma instância online' });
    const client = clients[inst];
    const messageId = `${inst}-${phone}-${Date.now()}`;
    await sendSingleMessage(inst, client, phone, message, null, messageId);
    markSent(phone, message);
    res.json({ success:true, instanceUsed: inst });
  } catch (e) {
    inQueue.delete(keyFor(req.body?.number||req.body?.to, req.body?.message));
    res.status(500).json({ success:false, error:e.message });
  }
}

app.post('/add-label', async (req,res)=> {
  try {
    const { phone, label } = req.body || {};
    if (!phone || !label) return res.status(400).json({ success:false, error:'Phone and label are required' });
    if (DISABLE_LABELS) return res.json({ success:true, message: 'labels desabilitados por env' });

    const inst = await waitUntilOnline(30000); if(!inst) return res.status(503).json({ success:false, error:'Nenhuma instância online' });
    const client = clients[inst];
    const wid = await getWidOrNull(client, phone);
    if (!wid) return res.status(400).json({ success:false, error:'Número sem WhatsApp' });

    await addLabelIfNeeded(client, wid, label);
    res.json({ success:true, instanceUsed: inst });
  } catch (e) { res.status(500).json({ success:false, error:e.message }); }
});

/* ============================ Enviar Produto Cancelado ============================ */
app.post('/send-product-canceled', async (req, res) => {
  try {
    const { phone, product_name, product_code, tenant_id } = req.body || {};
    const tenantId = tenant_id || req.tenant?.id || null;

    console.log('🗑️ Produto cancelado:', { phone, product_name, product_code, tenant_id: tenantId });

    if (!phone || !product_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Telefone e nome do produto obrigatórios' 
      });
    }

    // Buscar template PRODUCT_CANCELED do banco
    console.log('🔍 Buscando template PRODUCT_CANCELED...');
    let template;
    try {
      const templates = await supa(
        '/whatsapp_templates?select=*&type=eq.PRODUCT_CANCELED&limit=1',
        {},
        tenantId
      );
      template = templates[0];

      if (!template) {
        console.log('⚠️ Template PRODUCT_CANCELED não encontrado, usando padrão');
        template = {
          content: '❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.'
        };
      } else {
        console.log('✅ Template encontrado:', template.title || 'PRODUCT_CANCELED');
      }
    } catch (templateError) {
      console.error('❌ Erro buscar template:', templateError);
      // Usar template padrão se falhar
      template = {
        content: '❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.'
      };
    }

    // Substituir variáveis no template
    const message = template.content
      .replace(/\{\{produto\}\}/g, product_name || 'Produto')
      .replace(/\{\{codigo\}\}/g, product_code || '');

    console.log('📝 Mensagem preparada:', message.substring(0, 100));

    // Verificar duplicatas
    if (dupBlocked(phone, message)) {
      return res.status(409).json({ 
        success: false, 
        error: 'Mensagem duplicada bloqueada' 
      });
    }

    // Enviar mensagem
    const inst = await waitUntilOnline(30000);
    if (!inst) {
      return res.status(503).json({ 
        success: false, 
        error: 'Nenhuma instância online' 
      });
    }

    const client = clients[inst];
    const messageId = `${inst}-${phone}-${Date.now()}`;

    console.log('📤 Enviando produto cancelado para', phone);
    await sendSingleMessage(inst, client, phone, message, null, messageId);
    markSent(phone, message);

    console.log('✅ Mensagem de produto cancelado enviada com sucesso');

    // Log no banco
    try {
      await supa('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          phone: digits(phone),
          message: message,
          type: 'outgoing',
          product_name: product_name,
          sent_at: new Date().toISOString()
        })
      }, tenantId);
    } catch (logError) {
      console.warn('⚠️ Erro ao salvar log:', logError.message);
    }

    res.json({
      success: true,
      message: 'Mensagem de produto cancelado enviada',
      instanceUsed: inst,
      phone: digits(phone)
    });

  } catch (e) {
    console.error('❌ Erro enviar produto cancelado:', e);
    inQueue.delete(keyFor(req.body?.phone, 'product-canceled'));
    res.status(500).json({ 
      success: false, 
      error: e.message 
    });
  }
});

/* ============================ Start ============================ */
app.listen(PORT, () => {
  console.log('🟢 WHATSAPP BOT iniciado');
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('⚙️  Broadcast + Webhooks ativos | tag APP no envio em massa');
  if (WEB_VERSION_REMOTE) console.log(`🧪 webVersionCache: ${WEB_VERSION_REMOTE}`);
  if (DISABLE_LABELS) console.log('🏷️ Labels DESABILITADOS por env');
});