/**
 * server-whatsapp-individual.js — WhatsApp Server Individual
 * Servidor WhatsApp dedicado para UMA ÚNICA empresa
 * Cada empresa roda sua própria instância em porta diferente
 * Node 18+ | whatsapp-web.js | express | cors
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const qrcode = require('qrcode-terminal');

// Fetch polyfill
if (typeof fetch !== 'function') {
  global.fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
}

/* ============================ CONFIGURAÇÃO DA EMPRESA ============================ */
const COMPANY_NAME = process.env.COMPANY_NAME || 'Mania de Mulher';
const TENANT_ID = process.env.TENANT_ID || '08f2b1b9-3988-489e-8186-c60f0c0b0622';
const PORT = process.env.PORT || 3333;
const AUTH_FOLDER = process.env.AUTH_FOLDER || '.wwebjs_auth';

// Supabase
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

console.log(`\n${'='.repeat(60)}`);
console.log(`🚀 WhatsApp Server Individual - ${COMPANY_NAME}`);
console.log(`🆔 Tenant ID: ${TENANT_ID}`);
console.log(`🔌 Porta: ${PORT}`);
console.log(`${'='.repeat(60)}\n`);

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function normalizeDDD(phone) {
  if (!phone) return phone;
  
  let clean = String(phone).replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Valida tamanho
  if (clean.length < 10 || clean.length > 11) {
    console.log(`⚠️ Telefone com tamanho inválido: ${phone} (${clean.length} dígitos)`);
    return '55' + clean;
  }
  
  const ddd = parseInt(clean.substring(0, 2));
  
  // Adiciona 9º dígito se necessário
  if (clean.length === 10 && ddd >= 11 && ddd <= 99) {
    const firstDigit = clean[2];
    if (firstDigit !== '9') {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log(`✅ 9º dígito adicionado: ${phone} -> ${clean}`);
    }
  }
  
  return '55' + clean;
}

/* ============================ SUPABASE ============================ */
async function supaRaw(pathname, init) {
  try {
    const url = `${SUPABASE_URL}/rest/v1${pathname}`;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
    
    const res = await fetch(url, { 
      ...init, 
      headers: { ...headers, ...(init?.headers || {}) } 
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase ${res.status}: ${text}`);
    }
    
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    console.error('❌ Erro Supabase:', error.message);
    throw error;
  }
}

/* ============================ WHATSAPP CLIENT ============================ */
let whatsappClient = null;
let clientStatus = 'initializing';

function getAuthDir() {
  const authDir = path.join(__dirname, AUTH_FOLDER);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  return authDir;
}

async function createWhatsAppClient() {
  const authDir = getAuthDir();
  
  console.log(`🔧 Criando cliente WhatsApp...`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: TENANT_ID,
      dataPath: authDir
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions'
      ]
    }
  });

  client.on('qr', (qr) => {
    console.log(`\n📱 ESCANEIE O QR CODE:\n`);
    qrcode.generate(qr, { small: true });
    clientStatus = 'qr_code';
  });

  client.on('ready', () => {
    console.log(`✅ WhatsApp CONECTADO e PRONTO!`);
    clientStatus = 'online';
  });

  client.on('authenticated', () => {
    console.log(`🔐 Autenticado`);
    clientStatus = 'authenticated';
  });

  client.on('auth_failure', (msg) => {
    console.error(`❌ Falha autenticação:`, msg);
    clientStatus = 'auth_failure';
  });

  client.on('disconnected', (reason) => {
    console.log(`🔌 Desconectado:`, reason);
    clientStatus = 'offline';
  });

  client.on('message', async (message) => {
    try {
      if (message.from === 'status@broadcast' || message.broadcast) return;
      
      let groupName = null;
      let authorPhone = message.from.replace('@c.us', '').replace('@g.us', '');
      
      if (message.from.includes('@g.us')) {
        try {
          const chat = await message.getChat();
          if (chat.isGroup) {
            groupName = chat.name || 'Grupo';
            if (message.author) {
              authorPhone = message.author.replace('@c.us', '');
            }
          }
        } catch (error) {
          console.error('⚠️ Erro getChat:', error.message);
        }
      }

      console.log(`📨 Mensagem de ${authorPhone}: ${message.body?.substring(0, 30)}`);

      // Salvar no banco
      await supaRaw('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          phone: authorPhone,
          message: message.body || '',
          type: 'incoming',
          received_at: new Date().toISOString(),
          whatsapp_group_name: groupName
        })
      });

    } catch (error) {
      console.error('❌ Erro processar mensagem:', error.message);
    }
  });

  whatsappClient = client;
  
  try {
    await client.initialize();
    console.log(`🚀 Cliente inicializado`);
  } catch (error) {
    console.error(`❌ Erro inicializar:`, error);
    clientStatus = 'error';
  }
  
  return client;
}

async function getClient() {
  if (!whatsappClient) {
    console.log('⚠️ Cliente não existe');
    return null;
  }
  
  if (clientStatus !== 'online') {
    console.log(`⚠️ Cliente não está online (status: ${clientStatus})`);
    return null;
  }
  
  try {
    const state = await whatsappClient.getState();
    if (state !== 'CONNECTED') {
      console.log(`⚠️ Cliente não conectado (state: ${state})`);
      return null;
    }
    return whatsappClient;
  } catch (error) {
    console.error(`❌ Erro verificar estado:`, error.message);
    return null;
  }
}

/* ============================ EXPRESS ============================ */
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Log de todas requisições
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path}`);
  next();
});

/* ============================ ROUTES ============================ */

app.get('/status', (req, res) => {
  res.json({
    success: true,
    company: COMPANY_NAME,
    tenant_id: TENANT_ID,
    status: clientStatus,
    hasClient: !!whatsappClient,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online',
    whatsapp_status: clientStatus
  });
});

app.post('/send', async (req, res) => {
  console.log('\n📥 === REQUISIÇÃO /send ===');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { number, message, phone } = req.body;
    const phoneNumber = number || phone;
    
    if (!phoneNumber) {
      console.log('❌ Telefone não fornecido');
      return res.status(400).json({
        success: false,
        error: 'Telefone obrigatório (use "number" ou "phone")'
      });
    }
    
    if (!message) {
      console.log('❌ Mensagem não fornecida');
      return res.status(400).json({
        success: false,
        error: 'Mensagem obrigatória'
      });
    }
    
    console.log(`📞 Telefone original: ${phoneNumber}`);
    console.log(`💬 Mensagem: ${message.substring(0, 50)}...`);
    
    const client = await getClient();
    
    if (!client) {
      console.log(`❌ WhatsApp não disponível (status: ${clientStatus})`);
      return res.status(503).json({
        success: false,
        error: `WhatsApp não conectado. Status: ${clientStatus}`,
        status: clientStatus
      });
    }
    
    const normalizedPhone = normalizeDDD(phoneNumber);
    const chatId = `${normalizedPhone}@c.us`;
    
    console.log(`📤 Enviando para: ${chatId}`);
    
    await client.sendMessage(chatId, message);
    
    console.log(`✅ MENSAGEM ENVIADA COM SUCESSO!`);
    
    // Salvar log
    try {
      await supaRaw('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          phone: normalizedPhone,
          message: message,
          type: 'outgoing',
          sent_at: new Date().toISOString()
        })
      });
      console.log(`💾 Log salvo`);
    } catch (dbError) {
      console.error(`⚠️ Erro salvar log:`, dbError.message);
    }
    
    console.log('=== FIM /send ===\n');
    
    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      phone: normalizedPhone,
      company: COMPANY_NAME
    });
    
  } catch (error) {
    console.error(`\n❌ ERRO CRÍTICO em /send:`, error);
    console.log('Stack:', error.stack);
    console.log('=== FIM /send (ERRO) ===\n');
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

app.post('/broadcast', async (req, res) => {
  try {
    const { phones, message } = req.body;
    
    if (!phones || !Array.isArray(phones)) {
      return res.status(400).json({
        success: false,
        error: 'Lista de telefones obrigatória'
      });
    }
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Mensagem obrigatória'
      });
    }
    
    const client = await getClient();
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    console.log(`📤 Broadcast para ${phones.length} números`);
    
    const results = [];
    
    for (const phone of phones) {
      try {
        const normalizedPhone = normalizeDDD(phone);
        const chatId = `${normalizedPhone}@c.us`;
        
        await client.sendMessage(chatId, message);
        
        await supaRaw('/whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            phone: normalizedPhone,
            message: message,
            type: 'bulk',
            sent_at: new Date().toISOString()
          })
        });
        
        results.push({ phone: normalizedPhone, success: true });
        console.log(`✅ Enviado para ${normalizedPhone}`);
        
        await delay(2000);
        
      } catch (error) {
        console.error(`❌ Erro ${phone}:`, error.message);
        results.push({ phone, success: false, error: error.message });
      }
    }
    
    res.json({
      success: true,
      total: phones.length,
      results
    });
    
  } catch (error) {
    console.error('❌ Erro broadcast:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/broadcast/by-phones', async (req, res) => {
  try {
    const { phones, message } = req.body;
    
    if (!phones || !Array.isArray(phones) || !message) {
      return res.status(400).json({
        success: false,
        error: 'Lista de telefones e mensagem obrigatórios'
      });
    }
    
    const client = await getClient();
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    // Responder imediatamente
    res.json({
      success: true,
      message: 'Broadcast iniciado',
      total: phones.length
    });
    
    // Processar em background
    (async () => {
      console.log(`\n📤 Iniciando broadcast para ${phones.length} números`);
      let success = 0;
      let failed = 0;
      
      for (const phone of phones) {
        try {
          const normalizedPhone = normalizeDDD(phone);
          const chatId = `${normalizedPhone}@c.us`;
          
          await client.sendMessage(chatId, message);
          
          await supaRaw('/whatsapp_messages', {
            method: 'POST',
            body: JSON.stringify({
              tenant_id: TENANT_ID,
              phone: normalizedPhone,
              message: message,
              type: 'bulk',
              sent_at: new Date().toISOString()
            })
          });
          
          success++;
          console.log(`✅ [${success}/${phones.length}] ${normalizedPhone}`);
          
          await delay(2000);
          
        } catch (error) {
          failed++;
          console.error(`❌ Erro ${phone}:`, error.message);
        }
      }
      
      console.log(`\n✅ Broadcast concluído: ${success} enviadas, ${failed} falhas\n`);
    })();
    
  } catch (error) {
    console.error('❌ Erro broadcast:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/restart', async (req, res) => {
  try {
    console.log(`🔄 Reiniciando...`);
    
    if (whatsappClient) {
      await whatsappClient.destroy();
    }
    
    await createWhatsAppClient();
    
    res.json({
      success: true,
      message: 'Reiniciado',
      status: clientStatus
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* ============================ START ============================ */
async function startServer() {
  try {
    await createWhatsAppClient();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🌐 Servidor ATIVO na porta ${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`📤 Enviar: http://localhost:${PORT}/send`);
      console.log(`${'='.repeat(60)}\n`);
    });
    
  } catch (error) {
    console.error('❌ Erro iniciar:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n⚠️ Encerrando...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️ Encerrando...');
  process.exit(0);
});

startServer();
