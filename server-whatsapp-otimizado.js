const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const RetrySystem = require('./retry-system');

// ========================== CONFIG BÁSICA ==========================
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(fileUpload());
app.use(express.static('public'));
app.use(cors());

// >>> NOVO: variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';
const BROADCAST_SECRET = process.env.BROADCAST_SECRET || 'troque-este-segredo';
const WEBHOOK_SECRET   = process.env.WEBHOOK_SECRET   || 'troque-este-segredo';

const INSTANCES = ['instancia1'];
const STATE = {
  clients: {}, status: {}, numbers: {}, logs: [],
  messageStatus: [], clientResponses: [], blockedNumbers: new Set(),
  rrIndex: 0
};
const LIMIT = { LOGS: 1000, MSG_STATUS: 1000 };
const SEND_RULES = { interval: 2000, batchSize: 5, batchDelay: 3000, maxConcurrent: 1 };
let activeSenders = 0;

// >>> NOVO: tag automática quando envio em massa
let MASS_TAG_LABEL = null;

// ========================== UTILITÁRIOS ==========================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nowISO = () => new Date().toISOString();
const cap = (arr, n) => { if (arr.length > n) arr.splice(n); };
const digits = (s) => String(s||'').replace(/\D/g,'');

function requireSecret(req, envSecret) {
  const key = req.get('x-api-key') || req.query.key || (req.body && req.body.key);
  if (!key || key !== envSecret) throw new Error('unauthorized');
}

// Resolve executável do Chrome/Edge se existir
function resolveBrowserExecutable() {
  const list = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    '/usr/bin/google-chrome','/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const p of list) { try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}
const BROWSER = resolveBrowserExecutable();

// Log curto
function pushLog(obj) {
  STATE.logs.unshift({ data: nowISO(), ...obj });
  cap(STATE.logs, LIMIT.LOGS);
}

// ========================== SAFE LOCAL AUTH ==========================
class SafeLocalAuth extends LocalAuth {
  async logout() {
    try { await super.logout(); }
    catch (e) {
      const busy = e && (e.code === 'EBUSY' || e.code === 'EPERM');
      if (busy && String(e?.message||'').includes('.wwebjs_auth')) {
        console.warn('SafeLocalAuth: EBUSY/EPERM – mantendo pasta de sessão para evitar crash.');
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
      console.warn('Ignorando exceção/rejeição EBUSY/EPERM do LocalAuth.');
      return;
    }
    console.error(`❗ ${evt}:`, err);
  });
}

// ========================== ROUND-ROBIN ==========================
function getAvailableInstance() {
  const online = INSTANCES.filter(n => STATE.clients[n] && STATE.status[n] === 'online' && STATE.numbers[n]);
  if (!online.length) return null;
  const pick = online[STATE.rrIndex % online.length];
  STATE.rrIndex++;
  return pick;
}

// ========================== DUPLICIDADE ==========================
const DUP = { sent: new Map(), queue: new Set(), ttl: 10 * 60 * 1000 }; // 10min
const keyFor = (numero, mensagem) => {
  const n = digits(numero);
  const h = Buffer.from(String(mensagem).trim().toLowerCase()).toString('base64');
  return `${n}-${h}`;
};
function isDuplicate(numero, mensagem) {
  const k = keyFor(numero, mensagem); const now = Date.now();
  if (DUP.queue.has(k)) return true;
  const last = DUP.sent.get(k);
  if (last && now - last < DUP.ttl) return true;
  DUP.queue.add(k);
  return false;
}
function markSent(numero, mensagem) {
  const k = keyFor(numero, mensagem); const now = Date.now();
  DUP.sent.set(k, now); DUP.queue.delete(k);
  if (DUP.sent.size > 4000) {
    const cutoff = now - DUP.ttl;
    for (const [kk, ts] of DUP.sent) if (ts < cutoff) DUP.sent.delete(kk);
  }
}

// ========================== CLIENT FACTORY ==========================
function createClient(name) {
  const client = new Client({
    authStrategy: new SafeLocalAuth({ clientId: name, dataPath: path.join(__dirname,'.wwebjs_auth') }),
    puppeteer: {
      headless: false,
      executablePath: BROWSER || undefined,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--start-maximized'],
      timeout: 120000
    },
    qrMaxRetries: 3,
    takeoverOnConflict: true
  });

  client.on('qr', (qr) => {
    STATE.status[name] = 'qr_code';
    qrcode.generate(qr, { small: true });
    pushLog({ instancia: name, evento: 'qr_code' });
  });
  client.on('authenticated', () => { STATE.status[name] = 'authenticated'; pushLog({ instancia: name, evento: 'authenticated' }); });
  client.on('auth_failure', (msg) => { STATE.status[name] = 'auth_failure'; pushLog({ instancia: name, evento: 'auth_failure', msg }); });
  client.on('change_state', (st) => {
    if (st === 'CONNECTED') {
      STATE.status[name] = 'online';
      const num = client?.info?.wid?.user; if (num) STATE.numbers[name] = num;
    }
  });
  client.on('ready', () => {
    STATE.status[name] = 'online';
    const num = client?.info?.wid?.user || null; if (num) STATE.numbers[name] = num;
    pushLog({ instancia: name, evento: 'ready', numero: num || 'indefinido' });
  });
  client.on('disconnected', (reason) => {
    STATE.status[name] = 'offline'; STATE.numbers[name] = null;
    try { client.destroy(); } catch {}
    delete STATE.clients[name];
    pushLog({ instancia: name, evento: 'disconnected', motivo: reason });
  });

  client.on('message_ack', (msg, ack) => {
    const map = {0:'pendente',1:'enviado',2:'entregue',3:'lido',4:'visualizado'};
    const status = map[ack] || 'desconhecido';
    const numero = (msg.to || '').replace('@c.us','');
    STATE.messageStatus.push({ messageId: msg.id.id || `${name}-${numero}-${Date.now()}`, numero, status, instancia: name, timestamp: nowISO() });
    cap(STATE.messageStatus, LIMIT.MSG_STATUS);
  });

  // Entrada de mensagens de clientes (mantido)
  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const dt = new Date(msg.timestamp * 1000);
    if (Date.now() - dt.getTime() > 2*24*60*60*1000) return;

    const contact = await msg.getContact().catch(() => null);
    const numero = contact?.number || msg.from.replace('@c.us','');
    const mensagem = (msg.body || '').trim();

    STATE.clientResponses.unshift({ numero, mensagem, instancia: name, data: dt.toISOString(), processado: false });
    cap(STATE.clientResponses, LIMIT.LOGS);

    await processProductCode(client, numero, mensagem, name, contact);
  });

  return client;
}

// ========================== INICIALIZAÇÃO ==========================
for (const name of INSTANCES) {
  try {
    const c = createClient(name);
    STATE.clients[name] = c; STATE.status[name] = 'offline';
    c.initialize().catch(err => { STATE.status[name] = 'offline'; pushLog({ instancia: name, evento: 'init_error', msg: err.message }); });

    const t = setInterval(async () => {
      if (!STATE.clients[name]) return clearInterval(t);
      if (STATE.status[name] === 'online') return clearInterval(t);
      const s = await STATE.clients[name].getState().catch(() => null);
      if (s === 'CONNECTED') {
        STATE.status[name] = 'online';
        const num = STATE.clients[name]?.info?.wid?.user; if (num) STATE.numbers[name] = num;
        pushLog({ instancia: name, evento: 'reconciled', numero: num || null });
        clearInterval(t);
      }
    }, 5000);
  } catch (e) { pushLog({ instancia: name, evento: 'factory_error', msg: e.message }); }
}

// ========================== PROCESSAMENTO DE CÓDIGOS ==========================
async function processProductCode(client, numero, mensagem, instancia, contact) {
  try {
    const codigoMatch = mensagem.match(/^([CPA]\d{2,4})\s*$/i);
    if (!codigoMatch) return;

    const codigo = codigoMatch[1].toUpperCase();
    pushLog({ evento: 'codigo_detectado', codigo, numero, instancia });

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,price,stock,code,image_url&code=eq.${codigo}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Erro ao buscar produto ${codigo}: ${response.status}`);
        return;
      }

      const products = await response.json();
      if (!products || products.length === 0) {
        const notFoundMsg = `❌ *Produto não encontrado*\n\nO código *${codigo}* não existe em nosso catálogo.\n\nPor favor, verifique o código e tente novamente.`;
        await wppSend(client, numero, notFoundMsg);
        pushLog({ evento: 'produto_nao_encontrado', codigo, numero });
        return;
      }

      const produto = products[0];
      
      const customerResponse = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=*&phone=eq.${numero}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      let clienteNome = 'Cliente';
      if (customerResponse.ok) {
        const customers = await customerResponse.json();
        if (customers && customers.length > 0) {
          clienteNome = customers[0].name || clienteNome;
        }
      }

      const produtoMsg = `🛒 *Item Adicionado ao Carrinho*

Olá ${clienteNome}! 

✅ Produto: *${produto.name}*
📦 Quantidade: *1*
💰 Preço: *R$ ${Number(produto.price || 0).toFixed(2)}*
🏷️ Código: *${produto.code}*${produto.stock > 0 ? `\n📦 Estoque: ${produto.stock} unidades` : '\n⚠️ *Produto em falta*'}

Seu item foi adicionado com sucesso ao carrinho! 🎉

💬 Continue enviando códigos de produtos ou entre em contato para finalizar seu pedido.

Obrigado pela preferência! 🙌`;

      await wppSend(client, numero, produtoMsg);

      try {
        await addLabelToClient(client, numero, 'APP');
      } catch (e) {
        console.warn('Erro ao adicionar tag APP:', e.message);
      }

      try {
        const commonHeaders = {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        };

        try {
          const custCheck = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=id&phone=eq.${numero}`, { headers: commonHeaders });
          const custArr = await custCheck.json().catch(() => []);
          if (!Array.isArray(custArr) || custArr.length === 0) {
            await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
              method: 'POST',
              headers: commonHeaders,
              body: JSON.stringify({ phone: numero, name: clienteNome })
            });
          }
        } catch (e) {
          console.warn('Aviso: falha ao garantir cliente:', e.message);
        }

        const hoje = new Date().toISOString().slice(0, 10);
        const cartResp = await fetch(`${SUPABASE_URL}/rest/v1/carts`, {
          method: 'POST',
          headers: commonHeaders,
          body: JSON.stringify({
            customer_phone: numero,
            event_date: hoje,
            event_type: 'MANUAL',
            status: 'OPEN'
          })
        });
        if (!cartResp.ok) {
          console.warn('Erro ao criar carrinho:', await cartResp.text());
          return;
        }
        const cartArr = await cartResp.json();
        const cart = Array.isArray(cartArr) ? cartArr[0] : null;
        if (!cart || !cart.id) {
          console.warn('Carrinho não retornado');
          return;
        }

        const itemResp = await fetch(`${SUPABASE_URL}/rest/v1/cart_items`, {
          method: 'POST',
          headers: commonHeaders,
          body: JSON.stringify({
            cart_id: cart.id,
            product_id: produto.id,
            qty: 1,
            unit_price: Number(produto.price || 0)
          })
        });
        if (!itemResp.ok) {
          console.warn('Erro ao inserir item no carrinho:', await itemResp.text());
        }

        const orderResp = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
          method: 'POST',
          headers: commonHeaders,
          body: JSON.stringify({
            cart_id: cart.id,
            customer_phone: numero,
            event_type: 'MANUAL',
            event_date: hoje,
            total_amount: Number(produto.price || 0),
            is_paid: false
          })
        });
        if (!orderResp.ok) {
          console.warn('Erro ao criar pedido:', await orderResp.text());
        } else {
          pushLog({ evento: 'pedido_criado', numero, codigo, cart_id: cart.id });
        }
      } catch (e) {
        console.warn('Erro ao registrar carrinho/pedido:', e.message);
      }
      pushLog({ evento: 'produto_processado', codigo, produto: produto.name, cliente: clienteNome, numero });

    } catch (error) {
      console.error('Erro ao processar produto:', error);
      const errorMsg = `❌ *Erro interno*\n\nOcorreu um erro ao processar o código ${codigo}.\n\nTente novamente em alguns instantes.`;
      await wppSend(client, numero, errorMsg);
    }

    const msgIndex = STATE.clientResponses.findIndex(r => 
      r.numero === numero && r.mensagem === mensagem && !r.processado
    );
    if (msgIndex >= 0) {
      STATE.clientResponses[msgIndex].processado = true;
    }

  } catch (error) {
    console.error('Erro geral no processamento de código:', error);
  }
}

// ========================== FUNÇÕES WHATSAPP ==========================
async function addLabelToClient(client, numero, labelName) {
  try {
    const chatId = `${digits(numero)}@c.us`;
    const labels = await client.getLabels();
    let target = labels.find(l => l.name === labelName);
    if (!target) target = await client.createLabel(labelName);
    const chat = await client.getChatById(chatId);
    await chat.addLabel(target.id);
    pushLog({ evento: 'label_adicionada', numero, label: labelName });
  } catch (error) { console.warn(`Erro ao adicionar label ${labelName} para ${numero}:`, error.message); }
}
const retrySystem = new RetrySystem();

async function wppSend(client, numero, texto, imgPath) {
  const toId = `${digits(numero)}@c.us`;
  if (imgPath && fs.existsSync(imgPath)) {
    const media = MessageMedia.fromFilePath(imgPath);
    return client.sendMessage(toId, media, { caption: texto });
  }
  return client.sendMessage(toId, texto);
}

async function trySendThrough(instanceName, numero, mensagem, imgPath, messageId) {
  const client = STATE.clients[instanceName];
  if (!client || STATE.status[instanceName] !== 'online' || !STATE.numbers[instanceName]) throw new Error('instancia_indisponivel');
  try {
    await wppSend(client, numero, mensagem, imgPath);
  } catch {
    const sem9 = String(numero).replace(/^(\d{2})(\d{2})9(\d{8})$/, '$1$2$3');
    if (sem9 !== numero) await wppSend(client, sem9, mensagem, imgPath);
  }
  STATE.messageStatus.push({ messageId, numero, status: 'enviado', instancia: instanceName, timestamp: nowISO() });
  cap(STATE.messageStatus, LIMIT.MSG_STATUS);
  retrySystem.addMessageForRetry(messageId, numero, mensagem, instanceName, imgPath);

  // >>> NOVO: marca tag APP quando envio em massa estiver ativo
  if (MASS_TAG_LABEL) {
    try { await addLabelToClient(client, numero, MASS_TAG_LABEL); } catch {}
  }
}

// ========================== ENVIO (LOTE) ==========================
async function processSend({ numeros, mensagens, interval, batchSize, batchDelay, imgPath }) {
  let idxMsg = 0, lote = 0, ok = 0, dup = 0, err = 0;
  for (let i = 0; i < numeros.length; i++) {
    const numero = (numeros[i]||'').trim();
    const msg = (mensagens[idxMsg]||'').trim();
    idxMsg = (idxMsg + 1) % mensagens.length;

    if (!numero || !msg) continue;
    if (isDuplicate(numero, msg)) { dup++; continue; }

    let sent = false;
    for (let tent = 0; tent < 3 && !sent; tent++) {
      const inst = getAvailableInstance();
      if (!inst) { await sleep(5000); continue; }
      const messageId = `${inst}-${numero}-${Date.now()}`;
      try {
        await trySendThrough(inst, numero, msg, imgPath, messageId);
        markSent(numero, msg);
        ok++; sent = true;
        await sleep(interval);
      } catch { await sleep(1500); }
    }
    if (!sent) {
      err++;
      const k = keyFor(numero, msg);
      DUP.queue.delete(k);
      STATE.messageStatus.push({ messageId: `fail-${numero}-${Date.now()}`, numero, status: 'erro', instancia: 'N/A', timestamp: nowISO() });
      cap(STATE.messageStatus, LIMIT.MSG_STATUS);
    }

    lote++;
    if (lote >= batchSize) { await sleep(batchDelay); lote = 0; }
  }
  pushLog({ evento: 'envio_finalizado', ok, duplicatas: dup, erros: err });
}

// ========================== SUPABASE (leitura) ==========================
// >>> NOVO: util para consultar telefones por status de pedidos
async function supa(path, init) {
  const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init && init.headers) } });
  if (!res.ok) throw new Error(`Supabase ${res.status} ${path} ${await res.text()}`);
  return res.json();
}

async function getPhonesByOrderStatus(status /* 'paid' | 'unpaid' | 'all' */) {
  let qs = '/orders?select=customer_phone,is_paid&customer_phone=not.is.null';
  if (status === 'paid') qs += '&is_paid=eq.true';
  if (status === 'unpaid') qs += '&is_paid=eq.false';
  const rows = await supa(qs);
  const set = new Set(rows.map(r => digits(r.customer_phone)).filter(Boolean));
  return Array.from(set);
}

// ========================== WEBHOOKS (PEDIDOS) ==========================
// >>> NOVO: mensagens automáticas ao criar pedido / item adicionado / item cancelado
function composeOrderCreated(body) {
  const nome = body.customer_name || 'Cliente';
  const id   = body.order_id || '';
  const valor = Number(body.total_amount||0).toFixed(2);
  return `🧾 *Pedido criado*\n\nOlá ${nome}! Seu pedido *#${id}* foi criado.\n💰 Total: *R$ ${valor}*\nAssim que for confirmado, avisaremos aqui.`;
}
function composeItemAdded(body) {
  const p = body.product||{};
  return `🛒 *Item adicionado*\n\n${p.name || 'Produto'}\n🔖 Código: *${p.code || '-'}*\n📦 Qtde: *${p.qty||1}*\n💰 Unit.: *R$ ${Number(p.price||0).toFixed(2)}*`;
}
function composeItemCanceled(body) {
  const p = body.product||{};
  return `❌ *Item cancelado*\n\n${p.name || 'Produto'}\n🔖 Código: *${p.code || '-'}*\nQtde: *${p.qty||1}*`;
}

async function sendOne(phone, text, tagApp = false) {
  const inst = getAvailableInstance();
  if (!inst) throw new Error('Nenhuma instância disponível');
  const prev = MASS_TAG_LABEL;
  MASS_TAG_LABEL = tagApp ? 'APP' : null;
  try {
    const messageId = `${inst}-${phone}-${Date.now()}`;
    await trySendThrough(inst, phone, text, null, messageId);
  } finally {
    MASS_TAG_LABEL = prev;
  }
}

// Webhook guard
function verifyWebhook(req) {
  const h = req.get('x-webhook-secret') || req.query.secret || (req.body && req.body.secret);
  if (h !== WEBHOOK_SECRET) throw new Error('unauthorized');
}

app.post('/webhooks/order-created', async (req, res) => {
  try {
    verifyWebhook(req);
    const body = req.body || {};
    const phone = digits(body.customer_phone || '');
    if (!phone) return res.status(400).json({ error: 'phone ausente' });
    await sendOne(phone, composeOrderCreated(body), true);
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});

app.post('/webhooks/order-item-added', async (req, res) => {
  try {
    verifyWebhook(req);
    const body = req.body || {};
    const phone = digits(body.customer_phone || '');
    if (!phone) return res.status(400).json({ error: 'phone ausente' });
    await sendOne(phone, composeItemAdded(body), true);
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});

app.post('/webhooks/order-item-cancelled', async (req, res) => {
  try {
    verifyWebhook(req);
    const body = req.body || {};
    const phone = digits(body.customer_phone || '');
    if (!phone) return res.status(400).json({ error: 'phone ausente' });
    await sendOne(phone, composeItemCanceled(body), true);
    res.json({ ok: true });
  } catch (e) { res.status(e.message==='unauthorized'?401:500).json({ error: e.message }); }
});

// ========================== BROADCAST POR STATUS ==========================
// >>> NOVO: envia para clientes com pedidos pagos/não pagos/todos e marca TAG "APP"
app.post('/api/broadcast/orders', async (req, res) => {
  try {
    requireSecret(req, BROADCAST_SECRET);
    const { status = 'all', message, interval, batchSize, batchDelay, image } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message obrigatório' });

    const phones = await getPhonesByOrderStatus(status); // array único
    if (!phones.length) return res.json({ ok: true, total: 0 });

    const imgPath = null; // (opcional: aceite base64/file e salve em public/)
    MASS_TAG_LABEL = 'APP';
    activeSenders++;

    res.json({ ok: true, total: phones.length });

    (async () => {
      try {
        await processSend({
          numeros: phones,
          mensagens: [message],
          interval: Math.max(500, interval || SEND_RULES.interval),
          batchSize: Math.max(1, Math.min(50, batchSize || SEND_RULES.batchSize)),
          batchDelay: Math.max(1000, batchDelay || SEND_RULES.batchDelay),
          imgPath
        });
      } finally {
        MASS_TAG_LABEL = null;
        activeSenders = Math.max(0, activeSenders - 1);
      }
    })();
  } catch (e) {
    res.status(e.message==='unauthorized'?401:500).json({ error: e.message });
  }
});

// ========================== ROTAS PRINCIPAIS ==========================
const SEND_CTRL = { paused: false };
app.post('/api/pause-sending', (_,res)=>{ SEND_CTRL.paused=true; res.json({success:true}); });
app.post('/api/resume-sending',(_,res)=>{ SEND_CTRL.paused=false; res.json({success:true}); });
app.get('/api/sending-status',(_,res)=>{ res.json({ success:true, paused:SEND_CTRL.paused, ativos: activeSenders }); });

app.post('/api/send-config', async (req, res) => {
  try {
    if (activeSenders >= SEND_RULES.maxConcurrent) {
      return res.status(429).json({ sucesso:false, erro:`Máximo de ${SEND_RULES.maxConcurrent} processo(s) simultâneo(s)` });
    }
    const data = req.body?.data ? JSON.parse(req.body.data) : req.body?.data || null;
    const payload = data || req.body || {};
    const numeros = (payload.numeros||[]).map(n=>String(n)).filter(Boolean);
    const mensagens = (payload.mensagens||[]).map(m=>String(m)).filter(Boolean);
    if (!numeros.length || !mensagens.length) return res.status(400).json({ sucesso:false, erro:'números e mensagens são obrigatórios' });

    const interval = Math.max(500, payload.interval || SEND_RULES.interval);
    const batchSize = Math.max(1, Math.min(50, payload.batchSize || SEND_RULES.batchSize));
    const batchDelay = Math.max(1000, payload.batchDelay || SEND_RULES.batchDelay);

    const image = req.files?.imagem;
    const imgPath = image ? path.join(__dirname,'public',image.name) : null;
    if (imgPath) await image.mv(imgPath);

    activeSenders++;
    res.json({ sucesso:true, mensagem:'Processo iniciado', configuracoes:{ interval, batchSize, batchDelay } });

    (async () => {
      try {
        while (SEND_CTRL.paused) await sleep(1000);
        await processSend({ numeros, mensagens, interval, batchSize, batchDelay, imgPath });
      } finally {
        activeSenders = Math.max(0, activeSenders - 1);
        if (imgPath && fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      }
    })();
  } catch (e) {
    activeSenders = Math.max(0, activeSenders - 1);
    console.error('send-config error:', e);
    res.status(500).json({ sucesso:false, erro:e.message });
  }
});

app.post('/send-message', async (req, res) => {
  try {
    const { number, to, message } = req.body;
    const phone = number || to;
    const inst = getAvailableInstance();
    if (!inst) return res.status(503).json({ success: false, error: 'Nenhuma instância disponível' });
    const messageId = `${inst}-${phone}-${Date.now()}`;
    await trySendThrough(inst, phone, message, null, messageId);
    res.json({ success: true, instanceUsed: inst });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/send', async (req, res) => {
  try {
    const { number, to, message } = req.body;
    const phone = number || to;
    const inst = getAvailableInstance();
    if (!inst) return res.status(503).json({ success: false, error: 'Nenhuma instância disponível' });
    const messageId = `${inst}-${phone}-${Date.now()}`;
    await trySendThrough(inst, phone, message, null, messageId);
    res.json({ success: true, instanceUsed: inst });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/add-label', async (req, res) => {
  try {
    const { phone, label } = req.body;
    const inst = getAvailableInstance();
    if (!inst) return res.status(503).json({ success: false, error: 'Nenhuma instância disponível' });
    const client = STATE.clients[inst];
    const chatId = `${digits(phone)}@c.us`;
    const labels = await client.getLabels();
    let targetLabel = labels.find(l => l.name === label);
    if (!targetLabel) targetLabel = await client.createLabel(label);
    const chat = await client.getChatById(chatId);
    await chat.addLabel(targetLabel.id);
    res.json({ success: true, label: targetLabel.name });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/labels', async (req, res) => {
  try {
    const inst = getAvailableInstance();
    if (!inst) return res.status(503).json({ success: false, error: 'Nenhuma instância disponível' });
    const client = STATE.clients[inst];
    const labels = await client.getLabels();
    res.json({ success: true, labels: labels.map(l => ({ id: l.id, name: l.name })) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/status', (_,res)=>{ const inst = INSTANCES.map(n => ({ nome:n, status: STATE.status[n]||'offline', numero: STATE.numbers[n]||null })); res.json({ instancias: inst }); });
app.get('/api/logs',   (_,res)=> res.json({ logs: STATE.logs }));
app.get('/api/message-status', (_,res)=> res.json({ messageStatus: STATE.messageStatus }));
app.get('/api/client-responses', (_,res)=> res.json({ responses: STATE.clientResponses }));
app.get('/api/blocked-numbers',(_,res)=> res.json({ blockedNumbers: Array.from(STATE.blockedNumbers||new Set()), count: (STATE.blockedNumbers||new Set()).size }));

app.listen(3333, () => {
  console.log('🟢 SERVIDOR WHATSAPP em http://localhost:3333');
  console.log('📦 Broadcast por status + Webhooks de pedidos habilitados.');
});