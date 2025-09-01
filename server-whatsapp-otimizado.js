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

  // Mensagens recebidas (2 dias) + Processamento automático
  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const dt = new Date(msg.timestamp * 1000);
    if (Date.now() - dt.getTime() > 2*24*60*60*1000) return;
    
    const contact = await msg.getContact().catch(() => null);
    const numero = contact?.number || msg.from.replace('@c.us','');
    const mensagem = (msg.body || '').trim();
    
    // Armazenar mensagem recebida
    STATE.clientResponses.unshift({ 
      numero, 
      mensagem, 
      instancia: name, 
      data: dt.toISOString(),
      processado: false
    });
    cap(STATE.clientResponses, LIMIT.LOGS);
    
    // Processar códigos de produtos automaticamente
    await processProductCode(client, numero, mensagem, name, contact);
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

// ========================== PROCESSAMENTO DE CÓDIGOS ==========================
async function processProductCode(client, numero, mensagem, instancia, contact) {
  try {
    // Detectar códigos de produtos (formato: C### ou P### ou A###)
    const codigoMatch = mensagem.match(/^([CPA]\d{2,4})\s*$/i);
    if (!codigoMatch) return;
    
    const codigo = codigoMatch[1].toUpperCase();
    pushLog({ evento: 'codigo_detectado', codigo, numero, instancia });
    
    // Buscar produto no Supabase (simulação - você precisa ajustar a URL da sua API)
    try {
      const response = await fetch('https://hxtbsieodbtzgcvvkeqx.supabase.co/rest/v1/products?select=id,name,price,stock,code,image_url&code=eq.' + codigo, {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn(`Erro ao buscar produto ${codigo}: ${response.status}`);
        return;
      }
      
      const products = await response.json();
      if (!products || products.length === 0) {
        // Produto não encontrado
        const notFoundMsg = `❌ *Produto não encontrado*\n\nO código *${codigo}* não existe em nosso catálogo.\n\nPor favor, verifique o código e tente novamente.`;
        await wppSend(client, numero, notFoundMsg);
        pushLog({ evento: 'produto_nao_encontrado', codigo, numero });
        return;
      }
      
      const produto = products[0];
      
      // Buscar cliente na base
      const customerResponse = await fetch(`https://hxtbsieodbtzgcvvkeqx.supabase.co/rest/v1/customers?select=*&phone=eq.${numero}`, {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4',
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
      
      // Construir mensagem do produto
      const produtoMsg = `🛒 *Item Adicionado ao Carrinho*

Olá ${clienteNome}! 

✅ Produto: *${produto.name}*
📦 Quantidade: *1*
💰 Preço: *R$ ${Number(produto.price || 0).toFixed(2)}*
🏷️ Código: *${produto.code}*${produto.stock > 0 ? `\n📦 Estoque: ${produto.stock} unidades` : '\n⚠️ *Produto em falta*'}

Seu item foi adicionado com sucesso ao carrinho! 🎉

💬 Continue enviando códigos de produtos ou entre em contato para finalizar seu pedido.

Obrigado pela preferência! 🙌`;

      // Enviar mensagem do produto
      await wppSend(client, numero, produtoMsg);
      
      // Adicionar tag "app" ao cliente
      try {
        await addLabelToClient(client, numero, 'APP');
      } catch (e) {
        console.warn('Erro ao adicionar tag APP:', e.message);
      }
      
      // Criar/atualizar carrinho no Supabase (chamada à Edge Function)
      try {
        const cartResponse = await fetch('https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-connection', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'process_product_code',
            data: {
              phone: numero,
              productCode: codigo,
              customerName: clienteNome,
              productData: produto
            }
          })
        });
        
        if (!cartResponse.ok) {
          console.warn('Erro ao processar carrinho:', await cartResponse.text());
        }
      } catch (e) {
        console.warn('Erro ao chamar edge function:', e.message);
      }
      
      pushLog({ evento: 'produto_processado', codigo, produto: produto.name, cliente: clienteNome, numero });
      
    } catch (error) {
      console.error('Erro ao processar produto:', error);
      const errorMsg = `❌ *Erro interno*\n\nOcorreu um erro ao processar o código ${codigo}.\n\nTente novamente em alguns instantes.`;
      await wppSend(client, numero, errorMsg);
    }
    
    // Marcar mensagem como processada
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

async function addLabelToClient(client, numero, labelName) {
  try {
    const chatId = `${numero.replace(/\D/g, '')}@c.us`;
    
    // Buscar ou criar label
    const labels = await client.getLabels();
    let targetLabel = labels.find(l => l.name === labelName);
    
    if (!targetLabel) {
      targetLabel = await client.createLabel(labelName);
    }
    
    const chat = await client.getChatById(chatId);
    await chat.addLabel(targetLabel.id);
    
    pushLog({ evento: 'label_adicionada', numero, label: labelName });
  } catch (error) {
    console.warn(`Erro ao adicionar label ${labelName} para ${numero}:`, error.message);
  }
}
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

// ========================== WARMUP (SIMPLIFICADO) ==========================
const WARM = { active:false, i1:300000, i2:120000, curI:300000, cycle:1, msgs:[], timer:null };
async function warmupCycle() {
  const online = INSTANCES.filter(n => STATE.status[n]==='online' && STATE.clients[n] && STATE.numbers[n]);
  if (online.length < 2) return;
  for (let s=0;s<online.length;s++){
    const sender = online[s]; const c = STATE.clients[sender];
    for (let r=0;r<online.length;r++){
      if (r===s) continue;
      const receiver = `${STATE.numbers[online[r]]}@c.us`;
      const text = WARM.msgs[Math.floor(Math.random()*WARM.msgs.length)] || '👋';
      try { await c.sendMessage(receiver, text); await sleep(800); } catch {}
    }
    await sleep(1200);
  }
  WARM.cycle = WARM.cycle===1 ? 2 : 1;
  WARM.curI = WARM.cycle===1 ? WARM.i1 : WARM.i2;
}
function startWarmup(i1,i2,msgs){
  stopWarmup();
  WARM.active = true; WARM.i1=i1; WARM.i2=i2; WARM.curI=i1; WARM.cycle=1; WARM.msgs=msgs||['👋'];
  const loop = async () => { if (!WARM.active) return; await warmupCycle(); WARM.timer = setTimeout(loop, WARM.curI); };
  WARM.timer = setTimeout(loop, WARM.curI);
}
function stopWarmup(){ WARM.active=false; if (WARM.timer) clearTimeout(WARM.timer); WARM.timer=null; }
app.get('/api/warmup/status',(_,res)=> res.json({ active:WARM.active, cycle:WARM.cycle, interval:WARM.curI, msgs:WARM.msgs.length }));
app.post('/api/warmup/start',(req,res)=>{
  const { interval1, interval2, messages } = req.body||{};
  if (!interval1 || !interval2 || !Array.isArray(messages) || !messages.length) return res.status(400).json({ sucesso:false, erro:'intervalos e mensagens são obrigatórios' });
  startWarmup(interval1, interval2, messages);
  res.json({ sucesso:true });
});
app.post('/api/warmup/stop',(_,res)=>{ stopWarmup(); res.json({ sucesso:true }); });

// ========================== GRUPOS (ROTAÇÃO/ADMIN) ==========================
const groupConfig = new Map(); // groupId -> { instances:[], ptr:0 }
function nextGroupInstance(groupId) {
  const cfg = groupConfig.get(groupId);
  if (!cfg || !cfg.instances.length) return getAvailableInstance();
  const online = cfg.instances.filter(n => STATE.status[n]==='online');
  if (!online.length) return getAvailableInstance();
  const pick = online[cfg.ptr % online.length];
  cfg.ptr = (cfg.ptr + 1) % online.length;
  return pick;
}

async function addContactsToGroup(numbers, groupId) {
  const chatId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
  const result = [];
  for (let i=0;i<numbers.length;i++){
    const num = String(numbers[i]).replace(/\D/g,'');
    const inst = nextGroupInstance(groupId);
    if (!inst) { result.push({ participant:num, success:false, error:'sem_instancia' }); continue; }
    const client = STATE.clients[inst];
    try {
      const chat = await client.getChatById(chatId);
      const me = client.info.wid._serialized;
      const isAdmin = chat.participants?.some(p => p.id._serialized===me && p.isAdmin);
      if (!isAdmin) throw new Error('instancia_sem_admin');
      // msg prévia (best-effort)
      try { await client.sendMessage(`${num}@c.us`, 'Olá! 👋'); await sleep(1000); } catch {}
      await chat.addParticipants([`${num}@c.us`]);
      result.push({ participant: num, success: true, instancia: inst });
      await sleep(1000);
    } catch (e) {
      result.push({ participant: num, success: false, instancia: inst, error: e.message });
    }
  }
  return result;
}

app.get('/api/groups', async (_req,res)=>{
  const inst = getAvailableInstance();
  if (!inst) return res.status(503).json({ success:false, error:'Nenhuma instância disponível' });
  const c = STATE.clients[inst];
  try {
    const chats = await c.getChats();
    const groups = chats.filter(x=>x.isGroup).map(g=>({
      id: g.id._serialized, name: g.name, participantsCount: g.participants?.length||0,
      isAdmin: !!g.participants?.find(p=>p.id._serialized===c.info.wid._serialized)?.isAdmin
    }));
    res.json({ success:true, groups, instanceUsed: inst });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

app.post('/api/group/add', async (req,res)=>{
  const { numeros, groupId } = req.body||{};
  if (!Array.isArray(numeros) || !groupId) return res.status(400).json({ success:false, error:'números (array) e groupId são obrigatórios' });
  try {
    const r = await addContactsToGroup(numeros, groupId);
    const ok = r.filter(x=>x.success).length;
    res.json({ success:true, added: ok, total: numeros.length, result: r });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

app.post('/api/group/add-rotative', async (req,res)=>{
  const { numeros, groupId, delayBetweenContacts = 3 } = req.body||{};
  if (!Array.isArray(numeros) || !groupId) return res.status(400).json({ success:false, error:'payload inválido' });
  try {
    const out = [];
    for (let i=0;i<numeros.length;i++){
      const r = await addContactsToGroup([numeros[i]], groupId);
      out.push(r[0]); if (i < numeros.length-1) await sleep(delayBetweenContacts*1000);
    }
    const ok = out.filter(x=>x.success).length;
    res.json({ success:true, added: ok, total: numeros.length, result: out });
  } catch (e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

app.post('/api/group/config', (req,res)=>{
  const { groupId, instances } = req.body||{};
  if (!groupId || !Array.isArray(instances) || !instances.length) return res.status(400).json({ success:false, error:'groupId e instances obrigatórios' });
  const valid = instances.filter(n => INSTANCES.includes(n));
  if (!valid.length) return res.status(400).json({ success:false, error:'nenhuma instância válida' });
  groupConfig.set(groupId, { instances: valid, ptr: 0 });
  res.json({ success:true, groupId, instances: valid });
});
app.get('/api/group/config', (_req,res)=>{
  const cfg = {};
  for (const [gid, val] of groupConfig.entries()) cfg[gid] = { instances: val.instances, currentRotation: val.ptr };
  res.json({ success:true, configurations: cfg });
});

// ========================== ENVIO DE MENSAGENS ==========================
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