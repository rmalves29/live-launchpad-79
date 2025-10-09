/**
 * SERVER WHATSAPP - MANIA DE MULHER - VERSÃO ESTÁVEL
 * Com sistema de fila, auto-retry e proteção contra rate limiting
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Fetch polyfill
if (typeof fetch !== 'function') {
  global.fetch = require('node-fetch');
}

/* ==================== CONFIGURAÇÃO ==================== */
const COMPANY_NAME = 'MANIA DE MULHER';
const TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
const PORT = 3334;

const SESSION_DIR = '.wwebjs_auth_mania_mulher';
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

console.log(`\n${'='.repeat(70)}`);
console.log(`🚀 WhatsApp Server - ${COMPANY_NAME}`);
console.log(`🆔 Tenant ID: ${TENANT_ID}`);
console.log(`🔌 Porta: ${PORT}`);
console.log(`📁 Sessão: ${SESSION_DIR}`);
console.log(`${'='.repeat(70)}\n`);

/* ==================== ESTADO GLOBAL ==================== */
let whatsappClient = null;
let clientStatus = 'initializing';
let currentQRCode = null;
let reconnecting = false;

// Sistema de Fila de Mensagens
let messageQueue = [];
let processingQueue = false;

/* ==================== UTILS ==================== */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeDDD(phone) {
  if (!phone) return phone;
  let clean = String(phone).replace(/\D/g, '');
  if (clean.startsWith('55')) clean = clean.substring(2);
  if (clean.length < 10 || clean.length > 11) return '55' + clean;
  
  const ddd = parseInt(clean.substring(0, 2));
  if (ddd <= 30) {
    if (clean.length === 10) {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
    }
  } else {
    if (clean.length === 11 && clean[2] === '9') {
      clean = clean.substring(0, 2) + clean.substring(3);
    }
  }
  return '55' + clean;
}

/* ==================== SUPABASE ==================== */
async function supaRaw(pathname, init) {
  try {
    const url = `${SUPABASE_URL}/rest/v1${pathname}`;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
    
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase ${res.status}: ${text}`);
    }
    
    const text = await res.text();
    if (!text) return null;
    
    try {
      return JSON.parse(text);
    } catch (e) {
      console.warn('⚠️ Resposta não é JSON:', text);
      return null;
    }
  } catch (error) {
    console.error('❌ Erro Supabase:', error.message);
    return null;
  }
}

/* ==================== FILA DE MENSAGENS ==================== */
async function addToQueue(phone, message, type = 'single') {
  const item = {
    phone,
    message,
    type,
    retries: 0,
    timestamp: Date.now()
  };
  
  messageQueue.push(item);
  console.log(`📥 Mensagem adicionada à fila (total: ${messageQueue.length})`);
  
  // Iniciar processamento se não estiver rodando
  if (!processingQueue) {
    processMessageQueue();
  }
  
  return item;
}

async function processMessageQueue() {
  if (processingQueue) return;
  if (messageQueue.length === 0) return;
  
  processingQueue = true;
  console.log(`🔄 Iniciando processamento da fila (${messageQueue.length} itens)`);
  
  while (messageQueue.length > 0) {
    const item = messageQueue[0];
    
    try {
      // Verificar se cliente está conectado
      const client = await getClient();
      if (!client) {
        console.log('⚠️ Cliente não disponível, aguardando reconexão...');
        await delay(5000);
        continue;
      }
      
      // Normalizar telefone
      const normalizedPhone = normalizeDDD(item.phone);
      const chatId = normalizedPhone + '@c.us';
      
      console.log(`📤 Enviando para ${normalizedPhone}: ${item.message.substring(0, 50)}...`);
      
      // Enviar mensagem
      await client.sendMessage(chatId, item.message);
      
      console.log(`✅ Mensagem enviada com sucesso para ${normalizedPhone}`);
      
      // Salvar no banco
      await supaRaw('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          phone: item.phone,
          message: item.message,
          type: item.type === 'broadcast' ? 'bulk' : 'outgoing',
          sent_at: new Date().toISOString()
        })
      });
      
      // Remover da fila
      messageQueue.shift();
      
      // Delay entre mensagens (proteção contra rate limit)
      if (messageQueue.length > 0) {
        const delayTime = 2000 + Math.random() * 1000; // 2-3 segundos
        console.log(`⏱️ Aguardando ${Math.round(delayTime/1000)}s antes da próxima mensagem...`);
        await delay(delayTime);
      }
      
    } catch (error) {
      console.error(`❌ Erro ao enviar para ${item.phone}:`, error.message);
      
      item.retries++;
      
      if (item.retries >= 3) {
        console.log(`❌ Máximo de tentativas atingido para ${item.phone}, removendo da fila`);
        messageQueue.shift();
        
        // Salvar erro no banco
        await supaRaw('/whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            phone: item.phone,
            message: `ERRO: ${error.message} - ${item.message}`,
            type: 'error',
            sent_at: new Date().toISOString()
          })
        });
      } else {
        console.log(`🔄 Tentativa ${item.retries}/3 falhou, tentando novamente em 5s...`);
        await delay(5000);
      }
    }
  }
  
  processingQueue = false;
  console.log('✅ Processamento da fila concluído');
}

/* ==================== WHATSAPP CLIENT ==================== */
async function createWhatsAppClient() {
  console.log('🔧 Criando cliente WhatsApp...');
  
  // Garantir diretório de sessão
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
  } catch (error) {
    console.warn('⚠️ Erro ao criar diretório:', error.message);
  }
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: TENANT_ID,
      dataPath: SESSION_DIR
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--single-process',
        '--no-zygote',
        '--no-first-run'
      ],
      timeout: 60000,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    }
  });
  
  client.on('qr', (qr) => {
    console.log('\n📱 QR CODE GERADO!\n');
    qrcode.generate(qr, { small: true });
    console.log(`\n👉 Acesse http://localhost:${PORT} para ver o QR Code\n`);
    currentQRCode = qr;
    clientStatus = 'qr_code';
  });
  
  client.on('ready', async () => {
    console.log('✅ WhatsApp CONECTADO e PRONTO!');
    currentQRCode = null;
    clientStatus = 'online';
    reconnecting = false;
    
    // Processar fila se houver mensagens pendentes
    if (messageQueue.length > 0) {
      console.log(`📥 ${messageQueue.length} mensagens na fila, iniciando processamento...`);
      processMessageQueue();
    }
  });
  
  client.on('authenticated', () => {
    console.log('🔐 Autenticado com sucesso');
    clientStatus = 'authenticated';
  });
  
  client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    clientStatus = 'auth_failure';
    currentQRCode = null;
  });
  
  client.on('disconnected', async (reason) => {
    console.log(`🔌 Desconectado: ${reason}`);
    clientStatus = 'offline';
    currentQRCode = null;
    
    // Evitar múltiplas reconexões
    if (reconnecting) {
      console.log('⏭️ Reconexão já em andamento...');
      return;
    }
    
    // Se foi LOGOUT manual, não reconectar automaticamente
    if (reason === 'LOGOUT' || reason === 'UNPAIRED') {
      console.log('⚠️ Logout manual detectado, aguardando novo QR Code...');
      return;
    }
    
    reconnecting = true;
    
    try {
      console.log('🔄 Aguardando 10s antes de reconectar...');
      await delay(10000);
      
      console.log('🔄 Tentando reconectar...');
      await client.destroy();
      await delay(2000);
      await client.initialize();
    } catch (error) {
      console.error('❌ Erro ao reconectar:', error.message);
      clientStatus = 'error';
      reconnecting = false;
    }
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
          console.error('⚠️ Erro ao obter chat:', error.message);
        }
      }
      
      console.log(`📨 Mensagem recebida de ${authorPhone}`);
      
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
      console.error('❌ Erro ao processar mensagem:', error.message);
    }
  });
  
  whatsappClient = client;
  
  try {
    await client.initialize();
    console.log('🚀 Cliente inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar:', error.message);
    clientStatus = 'error';
    
    // Retry após erro de inicialização
    if (error.message.includes('Protocol error') || error.message.includes('Execution context')) {
      console.log('🔄 Tentando novamente em 5s...');
      await delay(5000);
      return createWhatsAppClient();
    }
  }
  
  return client;
}

async function getClient() {
  if (!whatsappClient) return null;
  if (clientStatus !== 'online') return null;
  
  try {
    const state = await whatsappClient.getState();
    if (state !== 'CONNECTED') return null;
    return whatsappClient;
  } catch (error) {
    return null;
  }
}

/* ==================== EXPRESS ==================== */
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path}`);
  next();
});

/* ==================== ROUTES ==================== */

// Página inicial com QR Code
app.get('/', (req, res) => {
  const statusEmoji = {
    'initializing': '⏳',
    'qr_code': '📱',
    'authenticated': '🔐',
    'online': '✅',
    'offline': '⚠️',
    'auth_failure': '❌',
    'error': '❌'
  };

  const statusText = {
    'initializing': 'Inicializando...',
    'qr_code': 'Aguardando leitura do QR Code',
    'authenticated': 'Autenticado',
    'online': 'Conectado e Online',
    'offline': 'Desconectado',
    'auth_failure': 'Falha na Autenticação',
    'error': 'Erro ao conectar'
  };

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp - ${COMPANY_NAME}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
        .company { color: #667eea; font-size: 20px; margin-bottom: 30px; }
        .status {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 20px;
            background: #f7f7f7;
            border-radius: 12px;
            margin-bottom: 30px;
            font-size: 18px;
        }
        .status-emoji { font-size: 32px; }
        .qr-container {
            text-align: center;
            padding: 30px;
            background: #f7f7f7;
            border-radius: 12px;
            margin-bottom: 20px;
        }
        #qrcode {
            display: inline-block;
            padding: 20px;
            background: white;
            border-radius: 12px;
        }
        .queue-info {
            background: #fff3cd;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
            text-align: center;
        }
        .queue-info strong { color: #856404; }
        .instructions {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 12px;
            margin-top: 20px;
        }
        .instructions h3 { color: #1976d2; margin-bottom: 10px; }
        .instructions ol { margin-left: 20px; color: #555; line-height: 1.8; }
        .info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-top: 20px;
        }
        .info-item {
            background: #f7f7f7;
            padding: 15px;
            border-radius: 8px;
        }
        .info-label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
            margin-bottom: 5px;
        }
        .info-value {
            font-size: 16px;
            color: #333;
            font-weight: 500;
        }
        .refresh-btn {
            width: 100%;
            padding: 15px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.3s;
        }
        .refresh-btn:hover { background: #764ba2; }
        .loading { text-align: center; color: #666; padding: 40px; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
</head>
<body>
    <div class="container">
        <h1>🚀 WhatsApp Server</h1>
        <div class="company">${COMPANY_NAME}</div>
        
        <div class="status">
            <span class="status-emoji">${statusEmoji[clientStatus] || '❓'}</span>
            <span>${statusText[clientStatus] || 'Status desconhecido'}</span>
        </div>

        ${messageQueue.length > 0 ? `
        <div class="queue-info">
            <strong>📥 ${messageQueue.length} mensagem(ns) na fila</strong>
            ${processingQueue ? '<br>🔄 Processando...' : ''}
        </div>
        ` : ''}

        ${currentQRCode ? `
        <div class="qr-container">
            <div id="qrcode"></div>
        </div>
        
        <div class="instructions">
            <h3>📱 Como conectar:</h3>
            <ol>
                <li>Abra o WhatsApp no seu celular</li>
                <li>Toque em Mais opções (⋮) ou Configurações</li>
                <li>Toque em "Aparelhos conectados"</li>
                <li>Toque em "Conectar um aparelho"</li>
                <li>Aponte seu celular para esta tela e escaneie o QR Code</li>
            </ol>
        </div>
        ` : clientStatus === 'online' ? `
        <div class="qr-container">
            <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
            <h2 style="color: #4caf50;">WhatsApp Conectado!</h2>
            <p style="color: #666; margin-top: 10px;">O servidor está online e pronto para enviar mensagens.</p>
        </div>
        ` : `
        <div class="loading">
            <p>Aguardando conexão...</p>
        </div>
        `}

        <div class="info">
            <div class="info-item">
                <div class="info-label">Tenant</div>
                <div class="info-value">${COMPANY_NAME}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Porta</div>
                <div class="info-value">${PORT}</div>
            </div>
        </div>

        <button class="refresh-btn" onclick="location.reload()">
            🔄 Atualizar Status
        </button>
    </div>

    <script>
        ${currentQRCode ? `
        QRCode.toCanvas(document.getElementById('qrcode'), '${currentQRCode}', {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        ` : ''}
        
        // Auto-refresh a cada 5 segundos
        setTimeout(() => location.reload(), 5000);
    </script>
</body>
</html>
  `;
  
  res.send(html);
});

// Status
app.get('/status', async (req, res) => {
  try {
    let whatsapp_state = 'UNKNOWN';
    let connected = false;
    
    if (whatsappClient && clientStatus === 'online') {
      try {
        whatsapp_state = await whatsappClient.getState();
        connected = whatsapp_state === 'CONNECTED';
      } catch (error) {
        console.error('Erro ao obter estado:', error.message);
      }
    }
    
    res.json({
      success: true,
      tenant: COMPANY_NAME,
      tenant_id: TENANT_ID,
      status: clientStatus,
      whatsapp_state,
      connected,
      queue_size: messageQueue.length,
      processing_queue: processingQueue
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enviar mensagem
app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone e message são obrigatórios'
      });
    }
    
    const client = await getClient();
    
    // Se cliente não está disponível, adicionar à fila
    if (!client) {
      await addToQueue(phone, message, 'single');
      return res.json({
        success: true,
        queued: true,
        message: 'Mensagem adicionada à fila (WhatsApp desconectado)',
        queue_size: messageQueue.length
      });
    }
    
    // Tentar enviar direto (com retry se falhar)
    let attempts = 0;
    let sent = false;
    
    while (attempts < 2 && !sent) {
      try {
        const normalizedPhone = normalizeDDD(phone);
        const chatId = normalizedPhone + '@c.us';
        
        await client.sendMessage(chatId, message);
        
        await supaRaw('/whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            phone,
            message,
            type: 'outgoing',
            sent_at: new Date().toISOString()
          })
        });
        
        sent = true;
        console.log(`✅ Mensagem enviada para ${normalizedPhone}`);
        
      } catch (error) {
        attempts++;
        console.error(`❌ Tentativa ${attempts} falhou:`, error.message);
        if (attempts < 2) await delay(2000);
      }
    }
    
    // Se falhou após 2 tentativas, adicionar à fila
    if (!sent) {
      await addToQueue(phone, message, 'single');
      return res.json({
        success: true,
        queued: true,
        message: 'Falha ao enviar, mensagem adicionada à fila',
        queue_size: messageQueue.length
      });
    }
    
    res.json({
      success: true,
      queued: false,
      message: 'Mensagem enviada com sucesso'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Broadcast (envio em massa)
app.post('/broadcast', async (req, res) => {
  try {
    const { phones, message } = req.body;
    
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'phones deve ser um array com pelo menos 1 telefone'
      });
    }
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message é obrigatório'
      });
    }
    
    // Adicionar todas as mensagens à fila
    for (const phone of phones) {
      await addToQueue(phone, message, 'broadcast');
    }
    
    console.log(`📥 ${phones.length} mensagens adicionadas à fila para broadcast`);
    
    res.json({
      success: true,
      queued: true,
      total: phones.length,
      message: `${phones.length} mensagens adicionadas à fila`,
      queue_size: messageQueue.length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Listar grupos
app.get('/list-all-groups', async (req, res) => {
  try {
    const client = await getClient();
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup).map(group => ({
      id: group.id._serialized,
      name: group.name,
      participants: group.participants?.length || 0
    }));
    
    res.json({
      success: true,
      groups,
      total: groups.length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enviar para grupo
app.post('/send-to-group', async (req, res) => {
  try {
    const { groupId, message } = req.body;
    
    if (!groupId || !message) {
      return res.status(400).json({
        success: false,
        error: 'groupId e message são obrigatórios'
      });
    }
    
    const client = await getClient();
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    await client.sendMessage(groupId, message);
    
    res.json({
      success: true,
      message: 'Mensagem enviada para o grupo'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Info da fila
app.get('/queue', (req, res) => {
  res.json({
    success: true,
    queue_size: messageQueue.length,
    processing: processingQueue,
    items: messageQueue.map(item => ({
      phone: item.phone,
      retries: item.retries,
      timestamp: item.timestamp,
      type: item.type
    }))
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'WhatsApp Server',
    company: COMPANY_NAME,
    tenant_id: TENANT_ID,
    port: PORT,
    status: clientStatus,
    queue_size: messageQueue.length,
    features: [
      'Message Queue',
      'Auto Retry (3x)',
      'Rate Limiting Protection',
      'Auto Reconnection',
      'Heartbeat'
    ]
  });
});

/* ==================== HEARTBEAT ==================== */
setInterval(async () => {
  if (whatsappClient && clientStatus === 'online') {
    try {
      const state = await whatsappClient.getState();
      if (state === 'CONNECTED') {
        console.log('💚 Heartbeat: Conexão ativa');
        
        // Se há mensagens na fila e não está processando, iniciar
        if (messageQueue.length > 0 && !processingQueue) {
          console.log(`📥 Iniciando processamento da fila (${messageQueue.length} itens)`);
          processMessageQueue();
        }
      } else {
        console.log(`⚠️ Heartbeat: Estado não conectado (${state})`);
      }
    } catch (error) {
      console.error('❌ Erro no heartbeat:', error.message);
    }
  }
}, 15000); // 15 segundos

/* ==================== ERROR HANDLERS ==================== */
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error.message);
});

/* ==================== START SERVER ==================== */
async function startServer() {
  app.listen(PORT, () => {
    console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`📥 Fila: http://localhost:${PORT}/queue`);
    console.log(`🏥 Health: http://localhost:${PORT}/health\n`);
  });
  
  // Aguardar servidor inicializar antes de criar cliente
  await delay(2000);
  
  await createWhatsAppClient();
}

startServer().catch(error => {
  console.error('❌ Erro fatal ao iniciar servidor:', error);
  process.exit(1);
});
