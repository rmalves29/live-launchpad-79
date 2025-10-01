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
// IMPORTANTE: Configure essas variáveis para cada empresa

const COMPANY_NAME = process.env.COMPANY_NAME || 'Mania de Mulher';
const TENANT_ID = process.env.TENANT_ID || ''; // UUID do tenant no banco
const PORT = process.env.PORT || 3333;
const AUTH_FOLDER = process.env.AUTH_FOLDER || '.wwebjs_auth';

// Supabase
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

/* ============================ VALIDAÇÃO ============================ */
if (!TENANT_ID) {
  console.error('❌ ERRO: TENANT_ID não configurado!');
  console.error('Configure a variável de ambiente TENANT_ID com o UUID da empresa');
  process.exit(1);
}

console.log(`🏢 Empresa: ${COMPANY_NAME}`);
console.log(`🆔 Tenant ID: ${TENANT_ID}`);
console.log(`🔌 Porta: ${PORT}`);
console.log(`📁 Pasta Auth: ${AUTH_FOLDER}`);

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Normaliza número de telefone brasileiro para WhatsApp
 */
function normalizeDDD(phone) {
  if (!phone) return phone;
  
  const cleanPhone = phone.replace(/\D/g, '');
  const withoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  let normalized = withoutDDI;
  
  if (normalized.length >= 10 && normalized.length <= 11) {
    const ddd = parseInt(normalized.substring(0, 2));
    
    if (ddd >= 11 && ddd <= 99) {
      if (normalized.length === 10) {
        const firstDigitAfterDDD = normalized[2];
        if (firstDigitAfterDDD !== '9') {
          normalized = normalized.substring(0, 2) + '9' + normalized.substring(2);
          console.log(`✅ 9º dígito adicionado: ${phone} -> ${normalized}`);
        }
      }
    }
  }
  
  return '55' + normalized;
}

/* ============================ SUPABASE ============================ */
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
  
  console.log(`🔧 Criando cliente WhatsApp para ${COMPANY_NAME}...`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: TENANT_ID,
      dataPath: authDir
    }),
  puppeteer: {
      headless: false, // Abre navegador visível
      devtools: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process',
        '--disable-extensions'
      ],
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    }
  });

  // QR Code
  client.on('qr', (qr) => {
    console.log(`\n📱 Escaneie o QR Code para ${COMPANY_NAME}:\n`);
    qrcode.generate(qr, { small: true });
    clientStatus = 'qr_code';
  });

  // Conectado
  client.on('ready', () => {
    console.log(`✅ WhatsApp conectado: ${COMPANY_NAME}`);
    clientStatus = 'online';
  });

  // Autenticado
  client.on('authenticated', () => {
    console.log(`🔐 Autenticado: ${COMPANY_NAME}`);
    clientStatus = 'authenticated';
  });

  // Falha autenticação
  client.on('auth_failure', (msg) => {
    console.error(`❌ Falha na autenticação:`, msg);
    clientStatus = 'auth_failure';
  });

  // Desconectado
  client.on('disconnected', (reason) => {
    console.log(`🔌 Desconectado:`, reason);
    clientStatus = 'offline';
  });

  // Mensagens recebidas
  client.on('message', async (message) => {
    try {
      await handleIncomingMessage(message);
    } catch (error) {
      console.error('❌ Erro no handler de mensagem:', error.message);
      // Não deixar o erro propagar para evitar crash
    }
  });

  whatsappClient = client;
  
  try {
    await client.initialize();
    console.log(`🚀 Cliente inicializado`);
  } catch (error) {
    console.error(`❌ Erro ao inicializar:`, error);
    clientStatus = 'error';
  }
  
  return client;
}

async function handleIncomingMessage(message) {
  try {
    // Verificar se o cliente ainda está conectado
    if (!whatsappClient || clientStatus !== 'online') {
      console.log(`⚠️ Cliente não está online, ignorando mensagem`);
      return;
    }

    let groupName = null;
    let authorPhone = null;
    let messageFrom = message.from;
    
    console.log(`📨 Mensagem recebida:`, {
      from: message.from,
      body: message.body?.substring(0, 50),
      hasAuthor: !!message.author
    });

    // Verificar se é grupo
    if (message.from && message.from.includes('@g.us')) {
      try {
        // Timeout de 5 segundos para getChat
        const chatPromise = message.getChat();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout getChat')), 5000)
        );
        
        const chat = await Promise.race([chatPromise, timeoutPromise]);
        
        if (chat && chat.isGroup) {
          groupName = chat.name || 'Grupo WhatsApp';
          
          if (message.author) {
            authorPhone = message.author.replace('@c.us', '');
            messageFrom = message.author;
          } else {
            console.log(`⚠️ Mensagem grupo sem author`);
            return;
          }
        }
      } catch (chatError) {
        // Se falhar ao obter chat de grupo, tentar extrair info do author
        if (chatError.message && chatError.message.includes('Execution context was destroyed')) {
          console.log('⚠️ Contexto destruído, usando author diretamente');
          if (message.author) {
            authorPhone = message.author.replace('@c.us', '');
            messageFrom = message.author;
            groupName = 'Grupo WhatsApp';
          } else {
            console.log('⚠️ Sem author, ignorando mensagem');
            return;
          }
        } else {
          console.error('❌ Erro obter grupo:', chatError.message);
          return;
        }
      }
    } else {
      authorPhone = message.from.replace('@c.us', '');
    }

    if (!authorPhone) {
      console.log(`⚠️ Telefone inválido`);
      return;
    }

    // Webhook
    const webhookPayload = {
      from: messageFrom,
      body: message.body || '',
      groupName: groupName,
      author: authorPhone,
      chatName: groupName
    };

    // Chamar edge function
    try {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-multitenant/${TENANT_ID}`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      });

      if (response.ok) {
        console.log(`✅ Webhook enviado`);
      } else {
        console.log(`⚠️ Webhook status: ${response.status}`);
      }
    } catch (webhookError) {
      console.error('❌ Erro webhook:', webhookError.message);
    }

    // Log no banco
    try {
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
      console.log(`💾 Mensagem salva`);
    } catch (dbError) {
      console.error('❌ Erro salvar:', dbError.message);
    }

  } catch (error) {
    console.error('❌ Erro processar mensagem:', error.message);
  }
}

async function getClient() {
  if (!whatsappClient || clientStatus !== 'online') {
    return null;
  }
  
  try {
    const state = await whatsappClient.getState();
    return state === 'CONNECTED' ? whatsappClient : null;
  } catch (error) {
    console.error(`❌ Erro verificar estado:`, error);
    return null;
  }
}

/* ============================ EXPRESS ============================ */
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors());

/* ============================ ROUTES ============================ */

// Status
app.get('/status', (req, res) => {
  res.json({
    success: true,
    company: COMPANY_NAME,
    tenant_id: TENANT_ID,
    status: clientStatus,
    hasClient: !!whatsappClient,
    port: PORT
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    company: COMPANY_NAME,
    tenant_id: TENANT_ID,
    timestamp: new Date().toISOString()
  });
});

// Enviar mensagem
app.post('/send', async (req, res) => {
  try {
    const { number, message, phone } = req.body;
    
    const phoneNumber = number || phone;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'Número e mensagem obrigatórios'
      });
    }
    
    const client = await getClient();
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado',
        status: clientStatus
      });
    }
    
    const normalizedPhone = normalizeDDD(phoneNumber);
    const chatId = `${normalizedPhone}@c.us`;
    
    console.log(`📤 Enviando para ${normalizedPhone}`);
    await client.sendMessage(chatId, message);
    console.log(`✅ Enviado`);
    
    // Log
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
    
    res.json({
      success: true,
      message: 'Mensagem enviada',
      phone: normalizedPhone,
      company: COMPANY_NAME
    });
    
  } catch (error) {
    console.error(`❌ Erro enviar:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Broadcast
app.post('/broadcast', async (req, res) => {
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
    
    const results = [];
    
    for (const phone of phones) {
      try {
        const normalizedPhone = normalizeDDD(phone);
        const chatId = `${normalizedPhone}@c.us`;
        
        await client.sendMessage(chatId, message);
        
        // Log
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
        
        results.push({
          phone: normalizedPhone,
          success: true
        });
        
        await delay(2000);
        
      } catch (error) {
        console.error(`❌ Erro enviar para ${phone}:`, error);
        results.push({
          phone: phone,
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Broadcast processado',
      company: COMPANY_NAME,
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

// Reiniciar
app.post('/restart', async (req, res) => {
  try {
    console.log(`🔄 Reiniciando cliente WhatsApp...`);
    
    if (whatsappClient) {
      try {
        await whatsappClient.destroy();
      } catch (error) {
        console.warn(`⚠️ Erro destruir cliente:`, error.message);
      }
    }
    
    await createWhatsAppClient();
    
    res.json({
      success: true,
      message: 'Cliente reiniciado',
      company: COMPANY_NAME,
      status: clientStatus
    });
    
  } catch (error) {
    console.error('❌ Erro reiniciar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* ============================ GRACEFUL SHUTDOWN ============================ */
async function gracefulShutdown(signal) {
  console.log(`\n⚠️ ${signal} recebido, encerrando servidor...`);
  console.log('📱 WhatsApp permanecerá conectado');
  
  // Não destruir o cliente para manter WhatsApp conectado
  // if (whatsappClient) {
  //   try {
  //     console.log('🔌 Desconectando WhatsApp...');
  //     await whatsappClient.destroy();
  //     console.log('✅ WhatsApp desconectado');
  //   } catch (error) {
  //     console.error('❌ Erro ao desconectar:', error.message);
  //   }
  // }
  
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

/* ============================ START ============================ */
async function startServer() {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 WhatsApp Server Individual - ${COMPANY_NAME}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Criar cliente WhatsApp
    await createWhatsAppClient();
    
    // Iniciar servidor HTTP
    app.listen(PORT, () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🌐 Servidor rodando na porta ${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`💚 Health: http://localhost:${PORT}/health`);
      console.log(`${'='.repeat(60)}\n`);
    });
    
  } catch (error) {
    console.error('❌ Erro iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown (já tratado acima via gracefulShutdown)
// Removido para evitar duplicação

startServer();
