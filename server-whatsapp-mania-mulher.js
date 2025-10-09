/**
 * WhatsApp Server - MANIA DE MULHER
 * Servidor dedicado para um único tenant
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const qrcode = require('qrcode-terminal');

// Fetch polyfill para Node.js
if (typeof fetch !== 'function') {
  global.fetch = require('node-fetch');
}

/* ============================ CONFIG ============================ */
const PORT = process.env.PORT || 3334;

// Tenant específico - MANIA DE MULHER
const TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
const TENANT_NAME = 'MANIA DE MULHER';

// Supabase
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

let whatsappClient = null;
let clientStatus = 'initializing';
let messageQueue = [];
let isProcessingQueue = false;
let reconnecting = false;

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));

/* ============================ MESSAGE QUEUE ============================ */
async function processMessageQueue() {
  if (isProcessingQueue || messageQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (messageQueue.length > 0) {
    const item = messageQueue[0];
    
    try {
      const client = await getClient();
      
      if (!client) {
        console.log(`⚠️ Cliente offline - mantendo ${messageQueue.length} mensagens na fila`);
        break;
      }
      
      console.log(`📤 Processando fila (${messageQueue.length} restantes): ${item.phone}`);
      
      await client.sendMessage(item.chatId, item.message);
      console.log(`✅ Enviado da fila: ${item.phone}`);
      
      // Remover item da fila apenas após sucesso
      messageQueue.shift();
      
      // Salvar no banco
      try {
        await supaRaw('/whatsapp_messages', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            phone: item.phone,
            message: item.message,
            type: item.type || 'outgoing',
            sent_at: new Date().toISOString()
          })
        });
      } catch (dbError) {
        console.error('⚠️ Erro ao salvar no banco:', dbError.message);
      }
      
      // Delay entre mensagens
      await delay(2000);
      
    } catch (error) {
      console.error(`❌ Erro ao processar item da fila:`, error.message);
      
      // Incrementar tentativas
      item.retries = (item.retries || 0) + 1;
      
      if (item.retries >= 3) {
        console.log(`❌ Removendo da fila após 3 tentativas: ${item.phone}`);
        messageQueue.shift();
      } else {
        console.log(`🔄 Tentativa ${item.retries}/3 - mantendo na fila`);
        break;
      }
    }
  }
  
  isProcessingQueue = false;
  
  // Continuar processando se ainda há itens
  if (messageQueue.length > 0) {
    setTimeout(() => processMessageQueue(), 5000);
  }
}

function addToQueue(phone, chatId, message, type = 'outgoing') {
  messageQueue.push({
    phone,
    chatId,
    message,
    type,
    retries: 0,
    timestamp: new Date().toISOString()
  });
  
  console.log(`📥 Adicionado à fila: ${phone} (total: ${messageQueue.length})`);
  
  // Iniciar processamento
  processMessageQueue();
}

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

/* ============================ SUPABASE HELPERS ============================ */
async function supaRaw(pathname, init) {
  const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1${pathname}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init && init.headers) } });
  if (!res.ok) throw new Error(`Supabase ${res.status} ${pathname} ${await res.text()}`);
  
  // Verificar se há conteúdo antes de parsear JSON
  const text = await res.text();
  if (!text || text.trim() === '') {
    return null;
  }
  
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('❌ Erro ao parsear JSON:', text.substring(0, 100));
    return null;
  }
}

/* ============================ WHATSAPP CLIENT ============================ */
function getAuthDir() {
  const baseDir = path.join(__dirname, '.wwebjs_auth_mania_mulher');
  
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  
  return baseDir;
}

async function createWhatsAppClient() {
  const authDir = getAuthDir();
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔧 Criando cliente WhatsApp para: ${TENANT_NAME}`);
  console.log(`📂 Diretório de autenticação: ${authDir}`);
  console.log(`${'='.repeat(70)}\n`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: `mania_mulher`,
      dataPath: authDir
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-web-security'
      ],
      timeout: 0
    },
    qrMaxRetries: 5,
    authTimeoutMs: 0,
    restartOnAuthFail: false,
    takeoverOnConflict: false,
    takeoverTimeoutMs: 0
  });

  client.on('qr', (qr) => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 QR CODE GERADO - ${TENANT_NAME}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`\n⚠️ IMPORTANTE: Escaneie o QR code ABAIXO com seu WhatsApp:\n`);
    qrcode.generate(qr, { small: true });
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Escaneie o QR code acima com seu WhatsApp`);
    console.log(`${'='.repeat(70)}\n`);
    clientStatus = 'qr_code';
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ ${TENANT_NAME} - Carregando: ${percent}%`);
  });

  client.on('ready', () => {
    console.log(`\n✅✅✅ WhatsApp CONECTADO: ${TENANT_NAME} ✅✅✅\n`);
    clientStatus = 'online';
  });

  client.on('authenticated', () => {
    console.log(`🔐 Autenticado: ${TENANT_NAME}`);
    clientStatus = 'authenticated';
  });

  client.on('auth_failure', (msg) => {
    console.error(`❌ Falha autenticação ${TENANT_NAME}:`, msg);
    clientStatus = 'auth_failure';
  });

  client.on('disconnected', async (reason) => {
    console.log(`⚠️ Desconectado ${TENANT_NAME}:`, reason);
    clientStatus = 'offline';
    
    // Não tentar reconectar automaticamente para evitar loops
    if (reason === 'LOGOUT' || reason === 'UNPAIRED') {
      console.log(`❌ ${reason} detectado - Necessário escanear QR Code novamente`);
      return;
    }
    
    // Para outros erros, aguardar e tentar reconectar UMA vez
    if (!reconnecting) {
      reconnecting = true;
      console.log(`🔄 Aguardando 10 segundos para tentar reconectar...`);
      
      setTimeout(async () => {
        try {
          console.log(`🔄 Tentando reconectar...`);
          await client.initialize();
          console.log(`✅ Reconexão iniciada`);
        } catch (error) {
          console.error(`❌ Erro ao reconectar:`, error.message);
        } finally {
          reconnecting = false;
        }
      }, 10000);
    }
  });

  // Heartbeat para manter conexão ativa e processar fila
  setInterval(async () => {
    if (whatsappClient && clientStatus === 'online') {
      try {
        const state = await whatsappClient.getState();
        if (state !== 'CONNECTED') {
          console.log(`⚠️ Estado alterado: ${state} - Marcando como offline`);
          clientStatus = 'offline';
        } else {
          console.log(`✅ Heartbeat OK - Fila: ${messageQueue.length} mensagens`);
          // Processar fila se houver mensagens
          if (messageQueue.length > 0 && !isProcessingQueue) {
            processMessageQueue();
          }
        }
      } catch (error) {
        console.error(`❌ Erro no heartbeat:`, error.message);
        clientStatus = 'offline';
      }
    }
  }, 15000); // Check a cada 15 segundos

  client.on('message', async (message) => {
    await handleIncomingMessage(message);
  });

  whatsappClient = client;
  clientStatus = 'initializing';
  
  console.log(`🔄 Iniciando WhatsApp Web para: ${TENANT_NAME}...`);
  console.log(`⏰ Aguarde o QR Code aparecer...\n`);
  
  client.initialize()
    .then(() => {
      console.log(`✅ Cliente inicializado: ${TENANT_NAME}`);
    })
    .catch((error) => {
      console.error(`\n❌ ERRO ao inicializar ${TENANT_NAME}:`);
      console.error(`   Mensagem: ${error.message}`);
      clientStatus = 'error';
    });
  
  return client;
}

async function handleIncomingMessage(message) {
  try {
    let groupName = null;
    let authorPhone = null;
    let messageFrom = message.from;

    // Verificar se é mensagem de grupo
    if (message.from && message.from.includes('@g.us')) {
      try {
        const chat = await message.getChat();
        if (chat && chat.isGroup) {
          groupName = chat.name || 'Grupo WhatsApp';
          
          if (message.author) {
            authorPhone = message.author.replace('@c.us', '');
            messageFrom = message.author;
          } else {
            return;
          }
        }
      } catch (chatError) {
        console.error('❌ Erro obter grupo:', chatError.message);
      }
    } else {
      authorPhone = message.from.replace('@c.us', '');
    }

    if (!authorPhone) return;

    // Webhook
    const webhookPayload = {
      from: messageFrom,
      body: message.body || '',
      groupName: groupName,
      author: authorPhone,
      chatName: groupName
    };

    try {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-multitenant/${TENANT_ID}`;
      
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      });
    } catch (webhookError) {
      console.error('❌ Erro webhook:', webhookError.message);
    }

    // Log no banco
    try {
      const result = await supaRaw('/whatsapp_messages', {
        method: 'POST',
        headers: {
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          phone: authorPhone,
          message: message.body || '',
          type: 'incoming',
          received_at: new Date().toISOString(),
          whatsapp_group_name: groupName
        })
      });
      console.log('✅ Mensagem salva no banco');
    } catch (dbError) {
      console.error('❌ Erro salvar banco:', dbError.message);
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
    return null;
  }
}

/* ============================ EXPRESS APP ============================ */
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors());

/* ============================ ROUTES ============================ */

app.get('/status', async (req, res) => {
  let state = 'unknown';
  let hasClient = !!whatsappClient;
  
  if (whatsappClient) {
    try {
      state = await whatsappClient.getState();
      // Se conectado, atualizar status
      if (state === 'CONNECTED' && clientStatus !== 'online') {
        clientStatus = 'online';
        // Processar fila quando reconectar
        if (messageQueue.length > 0) {
          console.log(`🔄 Reconectado - processando ${messageQueue.length} mensagens na fila`);
          processMessageQueue();
        }
      }
    } catch (error) {
      state = 'error';
      console.error('❌ Erro ao obter estado:', error.message);
    }
  }
  
  const isConnected = state === 'CONNECTED';
  
  console.log(`📊 Status: ${state}, Fila: ${messageQueue.length}, Processando: ${isProcessingQueue}`);
  
  res.json({
    success: true,
    tenant: TENANT_NAME,
    tenant_id: TENANT_ID,
    status: clientStatus,
    whatsapp_state: state,
    connected: isConnected,
    has_client: hasClient,
    queue_size: messageQueue.length,
    processing_queue: isProcessingQueue,
    timestamp: new Date().toISOString()
  });
});

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
    
    console.log(`📞 Tentando enviar para ${phoneNumber} - clientStatus: ${clientStatus}`);
    
    const client = await getClient();
    
    if (!client) {
      console.error(`❌ Cliente não disponível - clientStatus: ${clientStatus}, hasClient: ${!!whatsappClient}`);
      return res.status(503).json({
        success: false,
        error: `WhatsApp não conectado. Status: ${clientStatus}. Por favor, verifique o QR Code ou reinicie o servidor.`
      });
    }
    
    const normalizedPhone = normalizeDDD(phoneNumber);
    const chatId = `${normalizedPhone}@c.us`;
    
    // Verificar estado da conexão
    try {
      const state = await client.getState();
      console.log(`📊 Estado atual: ${state}`);
      
      if (state !== 'CONNECTED') {
        console.log(`⚠️ WhatsApp não conectado (${state}) - adicionando à fila`);
        addToQueue(normalizedPhone, chatId, message, 'outgoing');
        
        return res.json({
          success: true,
          message: 'Mensagem adicionada à fila (WhatsApp reconectando)',
          phone: normalizedPhone,
          queued: true
        });
      }
    } catch (stateError) {
      console.error(`❌ Erro ao verificar estado:`, stateError.message);
      addToQueue(normalizedPhone, chatId, message, 'outgoing');
      
      return res.json({
        success: true,
        message: 'Mensagem adicionada à fila (erro ao verificar conexão)',
        phone: normalizedPhone,
        queued: true
      });
    }
    
    // Tentar enviar direto com retry
    let attempts = 0;
    let sent = false;
    
    while (attempts < 2 && !sent) {
      try {
        attempts++;
        console.log(`📤 Tentativa ${attempts}/2: Enviando para ${normalizedPhone}...`);
        
        await client.sendMessage(chatId, message);
        console.log(`✅ Mensagem enviada para ${normalizedPhone}`);
        sent = true;
        
        // Salvar no banco
        try {
          await supaRaw('/whatsapp_messages', {
            method: 'POST',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              tenant_id: TENANT_ID,
              phone: normalizedPhone,
              message: message,
              type: 'outgoing',
              sent_at: new Date().toISOString()
            })
          });
        } catch (dbError) {
          console.error(`⚠️ Erro ao salvar no banco:`, dbError.message);
        }
        
      } catch (sendError) {
        console.error(`❌ Erro na tentativa ${attempts}:`, sendError.message);
        
        if (attempts < 2) {
          await delay(2000);
        }
      }
    }
    
    if (!sent) {
      console.log(`⚠️ Falha após 2 tentativas - adicionando à fila`);
      addToQueue(normalizedPhone, chatId, message, 'outgoing');
      
      return res.json({
        success: true,
        message: 'Mensagem adicionada à fila (falha no envio direto)',
        phone: normalizedPhone,
        queued: true
      });
    }
    
    res.json({
      success: true,
      message: 'Mensagem enviada',
      phone: normalizedPhone,
      queued: false
    });
    
  } catch (error) {
    console.error(`❌ Erro no endpoint /send:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao enviar mensagem'
    });
  }
});

app.post('/broadcast', async (req, res) => {
  try {
    const { phones, message } = req.body;
    
    if (!phones || !Array.isArray(phones) || !message) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos'
      });
    }
    
    console.log(`📢 Broadcast para ${phones.length} números`);
    
    // Adicionar todos à fila
    let added = 0;
    for (const phone of phones) {
      const normalizedPhone = normalizeDDD(phone);
      const chatId = `${normalizedPhone}@c.us`;
      addToQueue(normalizedPhone, chatId, message, 'bulk');
      added++;
    }
    
    res.json({
      success: true,
      message: `${added} mensagens adicionadas à fila`,
      total: phones.length,
      queue_size: messageQueue.length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/list-all-groups', async (req, res) => {
  try {
    const client = await getClient();
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    console.log(`📋 Listando grupos do WhatsApp...`);
    
    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(group => ({
        id: group.id._serialized,
        name: group.name,
        participantCount: group.participants ? group.participants.length : 0
      }));
    
    console.log(`✅ Encontrados ${groups.length} grupos`);
    
    res.json({
      success: true,
      groups,
      total: groups.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar grupos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/send-to-group', async (req, res) => {
  try {
    const { groupId, message } = req.body;
    
    if (!groupId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Group ID e mensagem obrigatórios'
      });
    }
    
    const client = await getClient();
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    console.log(`📤 Enviando mensagem para grupo ${groupId}`);
    
    await client.sendMessage(groupId, message);
    
    console.log(`✅ Mensagem enviada para grupo ${groupId}`);
    
    res.json({
      success: true,
      groupId,
      message: 'Mensagem enviada com sucesso'
    });
    
  } catch (error) {
    console.error('❌ Erro ao enviar para grupo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/sending-job/start', async (req, res) => {
  try {
    const { jobType, totalItems, jobData } = req.body;
    
    const job = await supaRaw('/sending_jobs', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        job_type: jobType,
        total_items: totalItems,
        job_data: jobData,
        status: 'running',
        current_index: 0,
        processed_items: 0
      }),
      headers: {
        'Prefer': 'return=representation'
      }
    });
    
    res.json({
      success: true,
      job: Array.isArray(job) ? job[0] : job
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/sending-job/update', async (req, res) => {
  try {
    const { jobId, currentIndex, processedItems, status } = req.body;
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID obrigatório'
      });
    }
    
    const updateData = {
      updated_at: new Date().toISOString()
    };
    
    if (currentIndex !== undefined) updateData.current_index = currentIndex;
    if (processedItems !== undefined) updateData.processed_items = processedItems;
    if (status) updateData.status = status;
    if (status === 'paused') updateData.paused_at = new Date().toISOString();
    if (status === 'completed') updateData.completed_at = new Date().toISOString();
    
    await supaRaw(`/sending_jobs?id=eq.${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData)
    });
    
    res.json({
      success: true,
      jobId
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    tenant: TENANT_NAME,
    version: '2.0',
    features: {
      message_queue: true,
      auto_retry: true,
      heartbeat: true
    }
  });
});

app.get('/queue', (req, res) => {
  res.json({
    success: true,
    queue_size: messageQueue.length,
    processing: isProcessingQueue,
    items: messageQueue.map(item => ({
      phone: item.phone,
      retries: item.retries,
      timestamp: item.timestamp,
      type: item.type
    }))
  });
});

/* ============================ START ============================ */
async function startServer() {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 WhatsApp Server - ${TENANT_NAME}`);
    console.log(`${'='.repeat(70)}\n`);
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Servidor online: http://localhost:${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`🏢 Tenant: ${TENANT_NAME}`);
      console.log(`🆔 Tenant ID: ${TENANT_ID}\n`);
    });
    
    createWhatsAppClient();
    
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando...');
  
  if (whatsappClient) {
    try {
      await whatsappClient.destroy();
    } catch (error) {}
  }
  
  process.exit(0);
});

startServer();
