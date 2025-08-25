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

// ===================== Estado simples =====================
let connState = 'starting';
let myNumber = null; // ex.: "5531999999999"
const receivedMessages = []; // armazena últimas N mensagens recebidas
const MAX_MESSAGES = 500;

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
  console.log('🔐 Autenticado');
});

client.on('auth_failure', (msg) => {
  connState = 'auth_failure';
  console.error('❌ Falha de autenticação:', msg);
});

client.on('ready', () => {
  connState = 'ready';
  try {
    const wid = client?.info?.wid?.user || null; // apenas dígitos
    myNumber = wid ? `${wid}` : null;
    console.log('✅ WhatsApp pronto. Meu número:', myNumber ? `+${myNumber}` : 'N/D');
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
});

// Inicializa
client.initialize().catch((e) => {
  connState = 'init_error';
  console.error('Erro ao inicializar WhatsApp:', e.message);
});

// ===================== Helpers =====================
function toWhatsId(raw) {
  // Mantém apenas dígitos
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) throw new Error('Número inválido');

  // Se já começa com o DDI, mantém; caso contrário, prefixa com COUNTRY_CODE
  const withCountry = digits.startsWith(COUNTRY_CODE) ? digits : COUNTRY_CODE + digits;
  return `${withCountry}@c.us`;
}

async function sendTextOrImage({ to, message, imageTempPath }) {
  const chatId = toWhatsId(to);
  if (imageTempPath) {
    const media = MessageMedia.fromFilePath(imageTempPath);
    const sent = await client.sendMessage(chatId, media, { caption: message || '' });
    return sent?.id?._serialized || null;
  }
  const sent = await client.sendMessage(chatId, message || '');
  return sent?.id?._serialized || null;
}

// ===================== Rotas HTTP =====================
// Status básico
app.get('/status', (_req, res) => {
  res.json({ state: connState, number: myNumber ? `+${myNumber}` : null });
});

// Últimas mensagens recebidas
app.get('/messages', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  res.json({ total: receivedMessages.length, data: receivedMessages.slice(0, limit) });
});

// Enviar mensagem (texto e/ou imagem) - endpoint original
app.post('/send', async (req, res) => {
  try {
    const isConnected = ['ready', 'connected', 'connected\n'].includes(connState);
    if (!isConnected) return res.status(409).json({ ok: false, error: `Instância não conectada (${connState})` });

    const { to, message } = req.body.to ? req.body : JSON.parse(req.body.data || '{}');
    if (!to) return res.status(400).json({ ok: false, error: 'Campo "to" é obrigatório' });

    let tempPath = null;
    if (req.files?.image) {
      const file = req.files.image;
      const uploadDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
      tempPath = path.join(uploadDir, `${Date.now()}_${file.name}`);
      await file.mv(tempPath);
    }

    const id = await sendTextOrImage({ to, message, imageTempPath: tempPath });

    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    return res.json({ ok: true, id });
  } catch (e) {
    console.error('Erro /send:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Enviar mensagem - endpoint compatível com o sistema Supabase
app.post('/send-message', async (req, res) => {
  try {
    const isConnected = ['ready', 'connected', 'connected\n'].includes(connState);
    if (!isConnected) {
      console.log(`❌ Instância não conectada (${connState})`);
      return res.status(409).json({ 
        success: false, 
        error: `Instância não conectada (${connState})` 
      });
    }

    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Campos "to" e "message" são obrigatórios' 
      });
    }

    console.log(`📤 Enviando mensagem para ${to}:`, message.substring(0, 100) + '...');
    
    const id = await sendTextOrImage({ to, message });
    
    console.log(`✅ Mensagem enviada com sucesso. ID: ${id}`);
    
    return res.json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      id 
    });
    
  } catch (e) {
    console.error('❌ Erro /send-message:', e.message);
    return res.status(500).json({ 
      success: false, 
      error: e.message 
    });
  }
});

// ===================== Start HTTP =====================
app.listen(PORT, () => {
  console.log(`🚀 HTTP server rodando na porta ${PORT}`);
  console.log('📋 Rotas disponíveis:');
  console.log('   GET  /status - Status da conexão WhatsApp');
  console.log('   GET  /messages?limit=50 - Últimas mensagens recebidas');
  console.log('   POST /send - Enviar mensagem (formato original)');
  console.log('   POST /send-message - Enviar mensagem (compatível com Supabase)');
  console.log('');
  console.log('💡 Para testar o envio:');
  console.log('   curl -X POST http://localhost:3000/send-message \\');
  console.log('   -H "Content-Type: application/json" \\');
  console.log('   -d \'{"to":"5531999999999","message":"Teste de mensagem"}\'');
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