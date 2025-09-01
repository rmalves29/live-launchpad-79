// server.js — versão otimizada
// Requisitos: node 18+, whatsapp-web.js, express, express-fileupload, cors, qrcode-terminal

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

const INSTANCES = ['instancia1','instancia2','instancia3','instancia4','instancia5','instancia6'];
const STATE = {
  clients: {},           // nome -> Client
  status: {},            // nome -> 'offline' | 'qr_code' | 'authenticated' | 'online' | 'auth_failure'
  numbers: {},           // nome -> '553199...' (sem @c.us)
  logs: [],              // eventos curtos
  messageStatus: [],     // {messageId, numero, status, instancia, timestamp}
  clientResponses: [],   // inbound recentes
  blockedNumbers: new Set(),
  rrIndex: 0,            // round-robin
};
const LIMIT = { LOGS: 1000, MSG_STATUS: 1000 };
const SEND_RULES = { interval: 2000, batchSize: 5, batchDelay: 3000, maxConcurrent: 1 };
let activeSenders = 0;

// ========================== UTILITÁRIOS ==========================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nowISO = () => new Date().toISOString();
const cap = (arr, n) => { if (arr.length > n) arr.splice(n); };

// Resolve executável do Chrome/Edge se existir
function resolveBrowserExecutable() {
  const list = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
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
// Ignora EBUSY/EPERM globais do LocalAuth
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
  const n = numero.replace(/\D/g,'');
  const h = Buffer.from(mensagem.trim().toLowerCase()).toString('base64');
  return `${n}-${h}`;
};
function isDuplicate(numero, mensagem) {
  const k = keyFor(numero, mensagem); const now = Date.now();
  if (DUP.queue.has(k)) return true;                 // na fila
  const last = DUP.sent.get(k);
  if (last && now - last < DUP.ttl) return true;     // recente
  DUP.queue.add(k);
  return false;
}
function markSent(numero, mensagem) {
  const k = keyFor(numero, mensagem); const now = Date.now();
  DUP.sent.set(k, now); DUP.queue.delete(k);
  // limpeza simples
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

  // Eventos essenciais
  client.on('qr', (qr) => {
    STATE.status[name] = 'qr_code';
    qrcode.generate(qr, { small: true });
    pushLog({ instancia: name, evento: 'qr_code' });
  });

  client.on('authenticated', () => {
    STATE.status[name] = 'authenticated';
    pushLog({ instancia: name, evento: 'authenticated' });
  });

  client.on('auth_failure', (msg) => {
    STATE.status[name] = 'auth_failure';
    pushLog({ instancia: name, evento: 'auth_failure', msg });
  });

  client.on('change_state', (st) => {
    if (st === 'CONNECTED') {
      STATE.status[name] = 'online';
      const num = client?.info?.wid?.user;
      if (num) STATE.numbers[name] = num;
    }
  });

  client.on('ready', () => {
    STATE.status[name] = 'online';
    const num = client?.info?.wid?.user || null;
    if (num) STATE.numbers[name] = num;
    pushLog({ instancia: name, evento: 'ready', numero: num || 'indefinido' });
  });

  client.on('disconnected', (reason) => {
    STATE.status[name] = 'offline';
    STATE.numbers[name] = null;
    try { client.destroy(); } catch {}
    delete STATE.clients[name];
    pushLog({ instancia: name, evento: 'disconnected', motivo: reason });
  });

  // Confirmações de envio
  client.on('message_ack', (msg, ack) => {
    const map = {0:'pendente',1:'enviado',2:'entregue',3:'lido',4:'visualizado'};
    const status = map[ack] || 'desconhecido';
    const numero = (msg.to || '').replace('@c.us','');
    STATE.messageStatus.push({ messageId: msg.id.id || `${name}-${numero}-${Date.now()}`, numero, status, instancia: name, timestamp: nowISO() });
    cap(STATE.messageStatus, LIMIT.MSG_STATUS);
  });

  // Mensagens recebidas (2 dias)
  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const dt = new Date(msg.timestamp * 1000);
    if (Date.now() - dt.getTime() > 2*24*60*60*1000) return;
    const contact = await msg.getContact().catch(() => null);
    const numero = contact?.number || msg.from.replace('@c.us','');
    STATE.clientResponses.unshift({ numero, mensagem: (msg.body||'').trim(), instancia: name, data: dt.toISOString() });
    cap(STATE.clientResponses, LIMIT.LOGS);
  });

  return client;
}

// ========================== INICIALIZAÇÃO ==========================
for (const name of INSTANCES) {
  try {
    const c = createClient(name);
    STATE.clients[name] = c;
    STATE.status[name] = 'offline';
    c.initialize().catch(err => {
      STATE.status[name] = 'offline';
      pushLog({ instancia: name, evento: 'init_error', msg: err.message });
    });

    // Reconciliação leve: detecta CONNECTED
    const t = setInterval(async () => {
      if (!STATE.clients[name]) return clearInterval(t);
      if (STATE.status[name] === 'online') return clearInterval(t);
      const s = await STATE.clients[name].getState().catch(() => null);
      if (s === 'CONNECTED') {
        STATE.status[name] = 'online';
        const num = STATE.clients[name]?.info?.wid?.user;
        if (num) STATE.numbers[name] = num;
        pushLog({ instancia: name, evento: 'reconciled', numero: num || null });
        clearInterval(t);
      }
    }, 5000);
  } catch (e) {
    pushLog({ instancia: name, evento: 'factory_error', msg: e.message });
  }
}

// ========================== ENVIO DE MENSAGENS ==========================
const retrySystem = new RetrySystem(); // Integração preservada
async function wppSend(client, numero, texto, imgPath) {
  const toId = `${numero.replace(/\D/g,'')}@c.us`;
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
  } catch (e) {
    // Tenta sem o nono dígito (BR)
    const sem9 = numero.replace(/^(\d{2})(\d{2})9(\d{8})$/, '$1$2$3');
    if (sem9 !== numero) await wppSend(client, sem9, mensagem, imgPath);
  }
  // Sucesso
  STATE.messageStatus.push({ messageId, numero, status: 'enviado', instancia: instanceName, timestamp: nowISO() });
  cap(STATE.messageStatus, LIMIT.MSG_STATUS);
  retrySystem.addMessageForRetry(messageId, numero, mensagem, instanceName, imgPath);
}

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
      } catch (e) {
        if (String(e.message).includes('instancia_indisponivel')) await sleep(1500);
        else await sleep(1500);
      }
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

// Controle de pausa
const SEND_CTRL = { paused: false };
app.post('/api/pause-sending', (_,res)=>{ SEND_CTRL.paused=true; res.json({success:true}); });
app.post('/api/resume-sending',(_,res)=>{ SEND_CTRL.paused=false; res.json({success:true}); });
app.get('/api/sending-status',(_,res)=>{ res.json({ success:true, paused:SEND_CTRL.paused, ativos: activeSenders }); });

// Endpoint de envio
app.post('/api/send-config', async (req, res) => {
  try {
    if (activeSenders >= SEND_RULES.maxConcurrent) {
      return res.status(429).json({ sucesso:false, erro:`Máximo de ${SEND_RULES.maxConcurrent} processo(s) simultâneo(s)` });
    }
    const data = req.body?.data ? JSON.parse(req.body.data) : null;
    if (!data) return res.status(400).json({ sucesso:false, erro:'payload inválido' });

    const numeros = (data.numeros||[]).map(n=>String(n)).filter(Boolean);
    const mensagens = (data.mensagens||[]).map(m=>String(m)).filter(Boolean);
    if (!numeros.length || !mensagens.length) return res.status(400).json({ sucesso:false, erro:'números e mensagens são obrigatórios' });

    const interval = Math.max(500, data.interval || SEND_RULES.interval);
    const batchSize = Math.max(1, Math.min(50, data.batchSize || SEND_RULES.batchSize));
    const batchDelay = Math.max(1000, data.batchDelay || SEND_RULES.batchDelay);

    const image = req.files?.imagem;
    const imgPath = image ? path.join(__dirname,'public',image.name) : null;
    if (imgPath) await image.mv(imgPath);

    activeSenders++;
    res.json({ sucesso:true, mensagem:'Processo iniciado', configuracoes:{ interval, batchSize, batchDelay } });

    // Loop respeitando pausa
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

// Endpoints de envio individual (compatibilidade)
app.post('/send-message', async (req, res) => {
  try {
    const { number, to, message } = req.body;
    const phone = number || to;
    
    const inst = getAvailableInstance();
    if (!inst) return res.status(503).json({ success: false, error: 'Nenhuma instância disponível' });
    
    const messageId = `${inst}-${phone}-${Date.now()}`;
    await trySendThrough(inst, phone, message, null, messageId);
    
    res.json({ success: true, instanceUsed: inst });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Adicionar etiqueta (compatibilidade)
app.post('/add-label', async (req, res) => {
  try {
    const { phone, label } = req.body;
    
    const inst = getAvailableInstance();
    if (!inst) return res.status(503).json({ success: false, error: 'Nenhuma instância disponível' });
    
    const client = STATE.clients[inst];
    const chatId = `${phone.replace(/\D/g, '')}@c.us`;
    
    // Buscar ou criar label
    const labels = await client.getLabels();
    let targetLabel = labels.find(l => l.name === label);
    
    if (!targetLabel) {
      targetLabel = await client.createLabel(label);
    }
    
    const chat = await client.getChatById(chatId);
    await chat.addLabel(targetLabel.id);
    
    res.json({ success: true, label: targetLabel.name });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Listar etiquetas
app.get('/labels', async (req, res) => {
  try {
    const inst = getAvailableInstance();
    if (!inst) return res.status(503).json({ success: false, error: 'Nenhuma instância disponível' });
    
    const client = STATE.clients[inst];
    const labels = await client.getLabels();
    
    res.json({ 
      success: true, 
      labels: labels.map(l => ({ id: l.id, name: l.name }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Estatísticas simples
app.get('/api/status', (_,res)=>{
  const inst = INSTANCES.map(n => ({ nome:n, status: STATE.status[n]||'offline', numero: STATE.numbers[n]||null }));
  res.json({ instancias: inst });
});
app.get('/api/logs', (_,res)=> res.json({ logs: STATE.logs }));
app.get('/api/message-status', (_,res)=> res.json({ messageStatus: STATE.messageStatus }));
app.get('/api/client-responses', (_,res)=> res.json({ responses: STATE.clientResponses }));
app.get('/api/retry-stats', (_,res)=> res.json({ success:true, stats: retrySystem.getStats() }));
app.get('/api/blocked-numbers',(_,res)=> res.json({ blockedNumbers: Array.from(STATE.blockedNumbers||new Set()), count: (STATE.blockedNumbers||new Set()).size }));

// Status (compatibilidade)
app.get('/status', (req, res) => {
  const onlineCount = INSTANCES.filter(n => STATE.status[n] === 'online').length;
  res.json({
    status: onlineCount > 0 ? 'ready' : 'offline',
    instances: INSTANCES.map(n => ({
      name: n,
      status: STATE.status[n] || 'offline',
      number: STATE.numbers[n] || null
    }))
  });
});

// ========================== START ==========================
app.listen(3333, () => {
  console.log('🟢 SERVIDOR WHATSAPP (otimizado) em http://localhost:3333');
  console.log('🔁 6 instâncias, round-robin, anti-duplicata 10min, warmup simples, grupos com rotação/admin.');
});