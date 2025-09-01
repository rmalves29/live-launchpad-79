// server-whatsapp-minimo.js
// Objetivo: manter somente o essencial — ler mensagens recebidas e enviar mensagens
// Requisitos: Node 18+, whatsapp-web.js, express, cors, express-fileupload, qrcode-terminal
// Instalar: npm i whatsapp-web.js express cors express-fileupload qrcode-terminal

const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

// ===================== Config =====================
const PORT = process.env.PORT || 3000;
const COUNTRY_CODE = process.env.COUNTRY_CODE || '55'; // código do país padrão (BR)
const HEADLESS = (process.env.HEADLESS || 'true').toLowerCase() === 'true'; // "true" | "false"

// ===================== App HTTP =====================
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(fileUpload()); // para upload opcional de imagem

// Logger simples com timestamp
const log = (...args) => console.log(new Date().toISOString(), '-', ...args);

// Log básico de requisições (sem vazar o texto completo da mensagem)
app.use((req, _res, next) => {
  if (req.method !== 'GET') {
    const body = req.body || {};
    const msgLen = (body?.message || '').length;
    const to = body?.to || body?.number || '(sem-destinatario)';
    log(`[REQ] ${req.method} ${req.url}`, { state: connState, to, msgLen });
  }
  next();
});

// ===================== Estado simples =====================
let connState = 'starting';
let myNumber = null; // ex.: "5531999999999"
const receivedMessages = []; // armazena últimas N mensagens recebidas
const MAX_MESSAGES = 500;
let reinitScheduled = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

async function scheduleReinit(reason = 'unknown') {
  if (reinitScheduled) return;
  reinitScheduled = true;
  
    connectionAttempts++;
  log(`🔄 Reinicializando WhatsApp (tentativa ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}, motivo: ${reason})`);
  
  // Aguardar um pouco antes de cada tentativa para evitar loops muito rápidos
  const waitTime = Math.min(connectionAttempts * 1000, 5000); // Máximo 5 segundos
  log(`⏳ Aguardando ${waitTime}ms antes da tentativa ${connectionAttempts}...`);
  
  if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    log('🚨 Máximo de tentativas atingido. Forçando reset completo...');
    connState = 'force_reset';
    connectionAttempts = 0;
    
    try {
      await client.destroy();
    } catch (_) {}
    
    // Remove dados de autenticação para forçar novo QR
    const authPath = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(authPath)) {
      try {
        fs.rmSync(authPath, { recursive: true, force: true });
        log('🗑️ Dados de autenticação removidos');
      } catch (e) {
        console.error('Erro ao remover dados de auth:', e.message);
      }
    }
    
    setTimeout(() => {
      log('🔄 Iniciando nova instância após reset...');
      client.initialize().catch((e) => {
        connState = 'init_error';
        console.error('Erro ao inicializar WhatsApp após reset:', e.message);
      }).finally(() => { reinitScheduled = false; });
    }, 3000);
    
    return;
  }
  
  connState = 'restarting';
  try { await client.destroy(); } catch (_) {}
  
  setTimeout(() => {
    log('🔄 Iniciando tentativa de reconexão...');
    client.initialize().catch((e) => {
      connState = 'init_error';
      console.error('Erro ao inicializar WhatsApp (retry):', e.message);
    }).finally(() => { reinitScheduled = false; });
  }, waitTime || 1500);
}

// ===================== Cliente WhatsApp =====================
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'instancia-unica',
    dataPath: path.join(__dirname, '.wwebjs_auth'),
  }),
  puppeteer: {
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  },
  takeoverOnConflict: true,
  qrMaxRetries: 0, // infinito no evento 'qr'
});

client.on('qr', (qr) => {
  connState = 'qr';
  console.log('\n===== ESCANEIE O QR CODE =====');
  qrcode.generate(qr, { small: true });
  console.log('==============================\n');
});

client.on('authenticated', () => {
  connState = 'authenticated';
  connectionAttempts = 0; // Reset contador ao autenticar
  console.log('🔐 Autenticado');
  log('🔄 Contador de tentativas resetado - autenticado');
});

client.on('auth_failure', (msg) => {
  connState = 'auth_failure';
  console.error('❌ Falha de autenticação:', msg);
  scheduleReinit('auth_failure');
});

client.on('ready', () => {
  connState = 'ready';
  connectionAttempts = 0; // Reset contador ao conectar com sucesso
  try {
    const wid = client?.info?.wid?.user || null; // apenas dígitos
    myNumber = wid ? `${wid}` : null;
    console.log('✅ WhatsApp pronto. Meu número:', myNumber ? `+${myNumber}` : 'N/D');
    log('🔄 Contador de tentativas resetado - conexão estabelecida');
  } catch {
    myNumber = null;
  }
});

client.on('change_state', (state) => {
  connState = String(state || '').toLowerCase();
  console.log('🔁 change_state →', state);
});

// Ler mensagens recebidas (não minhas)
client.on('message', async (msg) => {
  try {
    if (msg.fromMe) return;
    const contact = await msg.getContact();
    const numero = contact?.number || msg.from.replace('@c.us', '');
    const body = (msg.body || '').trim();
    const when = new Date(msg.timestamp * 1000).toISOString();

    const item = { numero, body, when, id: msg.id._serialized };
    receivedMessages.unshift(item);
    if (receivedMessages.length > MAX_MESSAGES) receivedMessages.pop();

    console.log(`📨 ${numero}: ${body}`);
  } catch (e) {
    console.error('Erro ao processar mensagem recebida:', e.message);
  }
});

client.on('disconnected', (reason) => {
  connState = 'disconnected';
  console.log('💀 Desconectado:', reason);
  scheduleReinit(`disconnected: ${reason}`);
});

// Inicializa
client.initialize().catch((e) => {
  connState = 'init_error';
  console.error('Erro ao inicializar WhatsApp:', e.message);
});

// ===================== Helpers =====================
function toWhatsId(raw) {
  const input = String(raw || '');
  const digits = input.replace(/\D/g, '');
  if (!digits) {
    console.error('toWhatsId: número inválido recebido:', raw);
    throw new Error('Número inválido');
  }
  const withCountry = digits.startsWith(COUNTRY_CODE) ? digits : COUNTRY_CODE + digits;
  const chatId = `${withCountry}@c.us`;
  log('[NUM] normalização', { raw, digits, withCountry, chatId });
  return chatId;
}

async function sendTextOrImage({ to, message, imageTempPath }) {
  try {
    const chatId = toWhatsId(to);
    const msgLen = (message || '').length;
    log('[SEND] preparando envio', { to, chatId, hasImage: !!imageTempPath, msgLen });

    if (imageTempPath) {
      const media = MessageMedia.fromFilePath(imageTempPath);
      const sent = await client.sendMessage(chatId, media, { caption: message || '' });
      const id = sent?.id?._serialized || null;
      log('[SEND] imagem enviada', { chatId, id });
      return id;
    }

    const sent = await client.sendMessage(chatId, message || '');
    const id = sent?.id?._serialized || null;
    log('[SEND] texto enviado', { chatId, id });
    return id;
  } catch (e) {
    const msg = String(e?.message || e);
    console.error('[SEND] erro no envio:', e.stack || msg);
    if (/Session closed|Target closed|Protocol error/i.test(msg)) {
      scheduleReinit(msg);
    }
    throw e;
  }
}

// ===== Health helpers =====
async function getHealth() {
  let waState = 'unknown';
  try {
    waState = await client.getState();
  } catch (_) {}
  const browserConnected = !!client?.pupBrowser?.isConnected?.();
  const pageClosed = !!client?.pupPage?.isClosed?.();
  return {
    connState,
    waState,
    browserConnected,
    pageClosed,
    number: myNumber ? `+${myNumber}` : null,
  };
}

function isUsable(h) {
  return (
    h?.waState === 'CONNECTED' &&
    h?.connState === 'ready' &&
    h?.browserConnected === true &&
    h?.pageClosed === false
  );
}

// ===================== Rotas HTTP =====================
// Status básico
app.get('/status', async (_req, res) => {
  const health = await getHealth();
  res.json({
    ...health,
    pid: process.pid,
    uptime: process.uptime(),
    headless: HEADLESS,
    timestamp: new Date().toISOString(),
  });
});

// Últimas mensagens recebidas
app.get('/messages', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  res.json({ total: receivedMessages.length, data: receivedMessages.slice(0, limit) });
});

// Enviar mensagem (texto e/ou imagem) - endpoint original
app.post('/send', async (req, res) => {
  try {
    const health = await getHealth();
    if (!isUsable(health)) {
      log('❌ /send: instância indisponível', health);
      scheduleReinit('unusable_before_send');
      return res.status(409).json({ ok: false, error: 'Instância indisponível', health });
    }

    let payload = {};
    try {
      payload = req.body?.to ? req.body : JSON.parse(req.body?.data || '{}');
    } catch (err) {
      console.warn('⚠️ /send: erro ao parsear body.data:', err?.message);
      payload = req.body || {};
    }

    const toRaw = payload.to || payload.number;
    const message = payload.message || '';
    if (!toRaw) return res.status(400).json({ ok: false, error: 'Campo "to" ou "number" é obrigatório' });

    const msgLen = message.length;
    log('[SEND] recebida', { toRaw, msgLen, state: connState });

    let tempPath = null;
    if (req.files?.image) {
      const file = req.files.image;
      const uploadDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
      tempPath = path.join(uploadDir, `${Date.now()}_${file.name}`);
      await file.mv(tempPath);
    }

    const id = await sendTextOrImage({ to: toRaw, message, imageTempPath: tempPath });

    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    log('[SEND] sucesso', { id });
    return res.json({ ok: true, id });
  } catch (e) {
    console.error('Erro /send:', e.stack || e.message);
    return res.status(500).json({ ok: false, error: e.message, stack: e.stack });
  }
});

// Enviar mensagem - endpoint compatível com o sistema Supabase
app.post('/send-message', async (req, res) => {
  try {
    const health = await getHealth();
    if (!isUsable(health)) {
      log('❌ /send-message: instância indisponível', health);
      scheduleReinit('unusable_before_send_message');
      return res.status(409).json({ 
        success: false, 
        error: 'Instância indisponível',
        health
      });
    }


    const { to, number, message } = req.body || {};
    const toRaw = to || number;
    if (!toRaw || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Campos "to"/"number" e "message" são obrigatórios' 
      });
    }

    const msgLen = (message || '').length;
    log('📤 /send-message', { toRaw, msgLen, state: connState });
    const id = await sendTextOrImage({ to: toRaw, message });
    log('✅ /send-message OK', { id });
    return res.json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      id 
    });
    
  } catch (e) {
    console.error('❌ Erro /send-message:', e.stack || e.message);
    return res.status(500).json({ 
      success: false, 
      error: e.message,
      stack: e.stack 
    });
  }
});

// Adicionar etiqueta a um contato
app.post('/add-label', async (req, res) => {
  try {
    const health = await getHealth();
    if (!isUsable(health)) {
      log('❌ /add-label: instância indisponível', health);
      return res.status(409).json({ 
        success: false, 
        error: 'Instância indisponível',
        health
      });
    }

    const { phone, label } = req.body || {};
    if (!phone || !label) {
      return res.status(400).json({ 
        success: false, 
        error: 'Campos "phone" e "label" são obrigatórios' 
      });
    }

    const chatId = toWhatsId(phone);
    log('🏷️ Adicionando label', { phone, chatId, label });

    // Obter o contato
    const contact = await client.getContactById(chatId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contato não encontrado'
      });
    }

    // Verificar se já tem a label
    const existingLabels = await contact.getLabels();
    const hasLabel = existingLabels.some(l => l.name === label);
    
    if (hasLabel) {
      log('🏷️ Label já existe no contato', { phone, label });
      return res.json({
        success: true,
        message: 'Label já existe no contato',
        labels: existingLabels.map(l => l.name)
      });
    }

    // Buscar ou criar a label
    const allLabels = await client.getLabels();
    let targetLabel = allLabels.find(l => l.name === label);
    
    if (!targetLabel) {
      log('🏷️ Criando nova label', { label });
      targetLabel = await client.getChatLabels();
      // Note: whatsapp-web.js pode ter limitações na criação de labels
      // Pode ser necessário criar manualmente no WhatsApp primeiro
    }

    if (targetLabel) {
      await contact.addLabel(targetLabel.id);
      log('✅ Label adicionada com sucesso', { phone, label });
      
      const updatedLabels = await contact.getLabels();
      return res.json({
        success: true,
        message: 'Label adicionada com sucesso',
        labels: updatedLabels.map(l => l.name)
      });
    } else {
      return res.status(400).json({
        success: false,
        error: `Label "${label}" não encontrada. Crie a label manualmente no WhatsApp primeiro.`
      });
    }

  } catch (e) {
    console.error('❌ Erro /add-label:', e.stack || e.message);
    return res.status(500).json({ 
      success: false, 
      error: e.message,
      stack: e.stack 
    });
  }
});

// Listar labels disponíveis
app.get('/labels', async (_req, res) => {
  try {
    const health = await getHealth();
    if (!isUsable(health)) {
      return res.status(409).json({ 
        success: false, 
        error: 'Instância indisponível',
        health
      });
    }

    const labels = await client.getLabels();
    log('📋 Listando labels', { count: labels.length });
    
    return res.json({
      success: true,
      labels: labels.map(l => ({ id: l.id, name: l.name }))
    });

  } catch (e) {
    console.error('❌ Erro /labels:', e.stack || e.message);
    return res.status(500).json({ 
      success: false, 
      error: e.message 
    });
  }
});

// Reiniciar manualmente a instância
app.post('/restart', async (_req, res) => {
  await scheduleReinit('manual');
  res.json({ ok: true, state: connState });
});

// ===================== Start HTTP =====================
app.listen(PORT, () => {
  console.log(`🚀 HTTP server rodando na porta ${PORT}`);
  console.log('📋 Rotas disponíveis:');
  console.log('   GET  /status - Status da conexão WhatsApp');
  console.log('   GET  /messages?limit=50 - Últimas mensagens recebidas');
  console.log('   GET  /labels - Listar labels disponíveis');
  console.log('   POST /send - Enviar mensagem (formato original)');
  console.log('   POST /send-message - Enviar mensagem (compatível com Supabase)');
  console.log('   POST /add-label - Adicionar label a um contato');
  console.log('');
  console.log('💡 Para testar o envio:');
  console.log('   curl -X POST http://localhost:3000/send-message \\');
  console.log('   -H "Content-Type: application/json" \\');
  console.log('   -d \'{"to":"5531999999999","message":"Teste de mensagem"}\'');
});

// Diagnostic handlers
process.on('unhandledRejection', (reason) => {
  console.error('🔴 UNHANDLED_REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🔴 UNCAUGHT_EXCEPTION:', err?.stack || err?.message || err);
});

// ===================== Encerramento gracioso =====================
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  try { 
    await client.destroy(); 
    console.log('✅ Cliente WhatsApp desconectado');
  } catch {}
  process.exit(0);
});