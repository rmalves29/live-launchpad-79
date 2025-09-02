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

/* ============================ Supabase helper ============================ */
async function supa(pathname, init) {
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
async function getPhonesByStatus(status) {
  // status: 'paid' | 'unpaid' | 'all'
  let qs = `/${ORDERS_TABLE}?select=${ORDER_PHONE_FIELD},${ORDER_PAID_FIELD}&${ORDER_PHONE_FIELD}=not.is.null`;
  if (status === 'paid')   qs += `&${ORDER_PAID_FIELD}=eq.true`;
  if (status === 'unpaid') qs += `&${ORDER_PAID_FIELD}=eq.false`;
  const rows = await supa(qs);
  const out = new Set(rows.map(r => digits(r[ORDER_PHONE_FIELD])).filter(Boolean));
  return Array.from(out);
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
  client.on('message_create', (msg) => { if (!msg.fromMe) client.emit('message', msg); });

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
    const texto = String(msg.body||'').trim();

    pushLog(clientResponses, { numero, mensagem: texto, instancia: instName, when: dt.toISOString() });

    // Aqui você pode processar códigos do tipo "C123" se quiser.
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
  const n = digits(numero);
  let wid = await client.getNumberId(n).catch(()=>null);
  if (!wid && !n.startsWith('55')) wid = await client.getNumberId(`55${n}`).catch(()=>null);
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

  const toWid = await getWidOrNull(client, numero);
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
      // fallback BR sem nono dígito
      const n = digits(numero);
      const sem9 = n.replace(/^(\d{2})(\d{2})9(\d{8})$/, '$1$2$3');
      if (sem9 !== n) {
        const wid2 = await getWidOrNull(client, sem9);
        if (!wid2) throw err;
        if (imgPath && fs.existsSync(imgPath)) {
          const media = MessageMedia.fromFilePath(imgPath);
          await client.sendMessage(wid2, media, { caption: mensagem });
        } else {
          await client.sendMessage(wid2, mensagem);
        }
        await addLabelIfNeeded(client, wid2, CURRENT_MASS_LABEL);
      } else {
        throw err;
      }
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
    if (!message) return res.status(400).json({ error: 'message é obrigatório' });

    const phones = await getPhonesByStatus(status);
    if (!phones.length) return res.json({ ok: true, total: 0, note: 'nenhum telefone encontrado' });

    CURRENT_MASS_LABEL = MASS_BROADCAST_LABEL;
    res.json({ ok: true, total: phones.length, status });

    (async () => {
      try {
        await processBatch({
          numeros: phones, mensagens: [message],
          interval: Math.max(500, interval || 2000),
          batchSize: Math.max(1, Math.min(50, batchSize || 5)),
          batchDelay: Math.max(1000, batchDelay || 3000),
          imgPath: null
        });
      } finally { CURRENT_MASS_LABEL = null; }
    })();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================ API — Webhooks ============================ */
function verifyWebhook(req) {
  const h = req.get('x-webhook-secret') || req.query.secret || req.body?.secret;
  if (h !== WEBHOOK_SECRET) throw new Error('unauthorized');
}
function composeOrderCreated(b) {
  const nome = b?.customer_name || 'Cliente';
  const total = fmtMoney(b?.total_amount);
  const id = b?.order_id || b?.id || '';
  return `🧾 *Pedido criado!*\n\nOlá ${nome} 👋\nSeu pedido *#${id}* foi registrado com sucesso.\n\nTotal: *${total}*\n\nQualquer dúvida é só responder aqui.`;
}
function composeItemAdded(b) {
  const p = b?.product || {};
  const nome = p?.name || 'Item';
  const cod = p?.code ? ` (${p.code})` : '';
  const qty = p?.qty || 1;
  const price = fmtMoney(p?.price);
  return `🛒 *Item adicionado ao pedido*\n\n✅ ${nome}${cod}\nQtd: *${qty}*\nPreço: *${price}*`;
}
function composeItemCancelled(b) {
  const p = b?.product || {};
  const nome = p?.name || 'Item';
  const cod = p?.code ? ` (${p.code})` : '';
  const qty = p?.qty || 1;
  return `❌ *Item cancelado*\n\n${nome}${cod}\nQtd: *${qty}* foi removido do seu pedido.`;
}

async function sendOne(phone, text) {
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
    await sendOne(phone, composeOrderCreated(req.body));
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});
app.post('/webhooks/order-item-added', async (req,res) => {
  try { verifyWebhook(req);
    const phone = digits(req.body?.customer_phone||req.body?.phone||'');
    if (!phone) return res.status(400).json({ error: 'phone ausente' });
    await sendOne(phone, composeItemAdded(req.body));
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});
app.post('/webhooks/order-item-cancelled', async (req,res) => {
  try { verifyWebhook(req);
    const phone = digits(req.body?.customer_phone||req.body?.phone||'');
    if (!phone) return res.status(400).json({ error: 'phone ausente' });
    await sendOne(phone, composeItemCancelled(req.body));
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});

// rotas de teste (sem secret) — para validar integração
app.post('/api/test/order-created', async (req,res)=> {
  try { const phone = digits(req.body?.phone||''); if(!phone) return res.status(400).json({error:'phone'}); await sendOne(phone, composeOrderCreated(req.body)); res.json({ok:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/test/item-added', async (req,res)=> {
  try { const phone = digits(req.body?.phone||''); if(!phone) return res.status(400).json({error:'phone'}); await sendOne(phone, composeItemAdded(req.body)); res.json({ok:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/test/item-cancelled', async (req,res)=> {
  try { const phone = digits(req.body?.phone||''); if(!phone) return res.status(400).json({error:'phone'}); await sendOne(phone, composeItemCancelled(req.body)); res.json({ok:true}); }
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

/* ============================ Start ============================ */
app.listen(PORT, () => {
  console.log('🟢 WHATSAPP BOT iniciado');
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('⚙️  Broadcast + Webhooks ativos | tag APP no envio em massa');
  if (WEB_VERSION_REMOTE) console.log(`🧪 webVersionCache: ${WEB_VERSION_REMOTE}`);
  if (DISABLE_LABELS) console.log('🏷️ Labels DESABILITADOS por env');
});