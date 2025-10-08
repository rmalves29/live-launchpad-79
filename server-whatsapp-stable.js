const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURAÇÕES
// ==========================================
const PORT = process.env.PORT || 3333;
const SESSION_PATH = './.wwebjs_auth';
const QUEUE_DELAY = 2000; // 2 segundos entre mensagens
const MAX_RETRIES = 3;
const RECONNECT_DELAY = 5000;

// Credenciais Supabase
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';

// Tenant padrão (pode ser sobrescrito por variável de ambiente)
const TENANT_ID = process.env.TENANT_ID || '3c92bf57-a114-4690-b4cf-642078fc9df9';

// ==========================================
// ESTADO GLOBAL
// ==========================================
let client = null;
let isReady = false;
let isConnecting = false;
let messageQueue = [];
let isProcessingQueue = false;
let connectionAttempts = 0;
let lastQRCode = null;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ==========================================
// UTILIDADES
// ==========================================
const log = {
  info: (msg, ...args) => console.log(`ℹ️  [${new Date().toISOString()}] ${msg}`, ...args),
  success: (msg, ...args) => console.log(`✅ [${new Date().toISOString()}] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`❌ [${new Date().toISOString()}] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`⚠️  [${new Date().toISOString()}] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`🔍 [${new Date().toISOString()}] ${msg}`, ...args),
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function killOldProcesses() {
  log.info('Limpando processos antigos...');
  
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('taskkill /F /IM node.exe /FI "PID ne %PARENT_PID%" 2>nul', (error) => {
        if (error) log.warn('Nenhum processo antigo encontrado');
        exec('taskkill /F /IM chrome.exe 2>nul', (error) => {
          if (error) log.warn('Nenhum processo Chrome encontrado');
          resolve();
        });
      });
    } else {
      exec('pkill -9 -f "node.*whatsapp" || true', (error) => {
        if (error) log.warn('Nenhum processo antigo encontrado');
        exec('pkill -9 chrome || true', (error) => {
          if (error) log.warn('Nenhum processo Chrome encontrado');
          resolve();
        });
      });
    }
  });
}

async function cleanupSessionFiles() {
  log.info('Limpando arquivos de sessão travados...');
  
  const lockFiles = [
    path.join(SESSION_PATH, 'Default', 'first_party_sets.db-journal'),
    path.join(SESSION_PATH, 'Default', 'LOCK'),
    path.join(SESSION_PATH, 'SingletonLock'),
  ];
  
  for (const file of lockFiles) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        log.success(`Removido: ${file}`);
      }
    } catch (error) {
      log.warn(`Não foi possível remover ${file}:`, error.message);
    }
  }
}

// ==========================================
// SUPABASE
// ==========================================
async function supabaseRequest(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${endpoint}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      log.error(`Supabase ${response.status}:`, error);
      throw new Error(`Supabase error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    log.error('Erro ao conectar com Supabase:', error.message);
    throw error;
  }
}

async function saveMessageToDatabase(phone, message, type = 'outgoing') {
  try {
    await supabaseRequest('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        phone: phone.replace(/\D/g, ''),
        message,
        type,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
    });
    log.success(`Mensagem salva no banco para ${phone}`);
  } catch (error) {
    log.error('Erro ao salvar mensagem:', error.message);
  }
}

function formatPhoneNumber(number) {
  // Remove tudo que não é número
  let cleaned = number.replace(/\D/g, '');
  
  // Se já tem DDI 55, remove
  if (cleaned.startsWith('55')) {
    cleaned = cleaned.substring(2);
  }
  
  // Se não tem 9 dígitos após DDD, adiciona o 9
  if (cleaned.length === 10) {
    const ddd = cleaned.substring(0, 2);
    const numero = cleaned.substring(2);
    cleaned = ddd + '9' + numero;
  }
  
  // Adiciona DDI 55 e @c.us
  return `55${cleaned}@c.us`;
}

// ==========================================
// QUEUE DE MENSAGENS
// ==========================================
class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.stats = {
      sent: 0,
      failed: 0,
      pending: 0,
    };
  }

  add(task) {
    this.queue.push({
      ...task,
      id: Date.now() + Math.random(),
      attempts: 0,
      status: 'pending',
      createdAt: new Date(),
    });
    this.stats.pending = this.queue.length;
    log.info(`📥 Mensagem adicionada à fila. Total: ${this.queue.length}`);
    
    if (!this.processing) {
      this.process();
    }
  }

  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    log.info(`🔄 Processando fila de mensagens (${this.queue.length} pendentes)`);

    while (this.queue.length > 0) {
      const task = this.queue[0];
      
      try {
        if (!isReady) {
          log.warn('⏸️  WhatsApp não está pronto. Pausando fila...');
          await sleep(5000);
          continue;
        }

        log.debug(`📤 Enviando mensagem para ${task.number}`);
        await this.executeTask(task);
        
        this.queue.shift();
        this.stats.sent++;
        this.stats.pending = this.queue.length;
        
        log.success(`✉️  Mensagem enviada com sucesso para ${task.number}`);
        
        if (this.queue.length > 0) {
          log.debug(`⏱️  Aguardando ${QUEUE_DELAY}ms antes da próxima mensagem...`);
          await sleep(QUEUE_DELAY);
        }
      } catch (error) {
        task.attempts++;
        
        if (task.attempts >= MAX_RETRIES) {
          log.error(`❌ Falha após ${MAX_RETRIES} tentativas para ${task.number}:`, error.message);
          this.queue.shift();
          this.stats.failed++;
          this.stats.pending = this.queue.length;
        } else {
          log.warn(`⚠️  Tentativa ${task.attempts}/${MAX_RETRIES} falhou para ${task.number}. Tentando novamente...`);
          await sleep(3000);
        }
      }
    }

    this.processing = false;
    log.success('✅ Fila de mensagens processada completamente');
  }

  async executeTask(task) {
    const chatId = formatPhoneNumber(task.number);
    await client.sendMessage(chatId, task.message);
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processing: this.processing,
    };
  }

  clear() {
    this.queue = [];
    this.stats.pending = 0;
    log.info('🗑️  Fila de mensagens limpa');
  }
}

const messageQueueManager = new MessageQueue();

// ==========================================
// INICIALIZAÇÃO DO WHATSAPP
// ==========================================
async function initializeWhatsApp() {
  if (isConnecting) {
    log.warn('Já existe uma tentativa de conexão em andamento');
    return;
  }

  isConnecting = true;
  connectionAttempts++;
  
  log.info(`🚀 Iniciando WhatsApp Client (tentativa ${connectionAttempts})...`);

  try {
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: SESSION_PATH,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--safebrowsing-disable-auto-update',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      },
    });

    setupEventHandlers();
    await client.initialize();
    
  } catch (error) {
    log.error('Erro ao inicializar WhatsApp:', error);
    isConnecting = false;
    
    if (connectionAttempts < 3) {
      log.info(`Tentando reconectar em ${RECONNECT_DELAY / 1000}s...`);
      setTimeout(initializeWhatsApp, RECONNECT_DELAY);
    } else {
      log.error('❌ Número máximo de tentativas de conexão atingido');
    }
  }
}

function setupEventHandlers() {
  client.on('qr', (qr) => {
    lastQRCode = qr;
    log.info('📱 QR Code gerado! Escaneie com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
    log.info('Aguardando escaneamento...');
  });

  client.on('authenticated', () => {
    log.success('✅ Cliente WhatsApp autenticado!');
    connectionAttempts = 0;
  });

  client.on('auth_failure', (msg) => {
    log.error('❌ Falha na autenticação:', msg);
    isReady = false;
    isConnecting = false;
    
    // Tentar reconectar após falha de autenticação
    if (connectionAttempts < 3) {
      log.info('Tentando reconectar...');
      setTimeout(initializeWhatsApp, RECONNECT_DELAY);
    }
  });

  client.on('ready', () => {
    isReady = true;
    isConnecting = false;
    connectionAttempts = 0;
    log.success('✅ Cliente WhatsApp pronto para enviar mensagens!');
    log.success(`📱 Conectado como: ${client.info.pushname || 'N/A'}`);
    log.success(`📞 Número: ${client.info.wid.user || 'N/A'}`);
    
    // Processar mensagens pendentes na fila
    if (messageQueueManager.queue.length > 0) {
      log.info(`📥 Processando ${messageQueueManager.queue.length} mensagens pendentes...`);
      messageQueueManager.process();
    }
  });

  client.on('disconnected', (reason) => {
    log.warn('⚠️  Cliente WhatsApp desconectado:', reason);
    isReady = false;
    isConnecting = false;
    
    // Auto-reconexão
    log.info(`Reconectando em ${RECONNECT_DELAY / 1000}s...`);
    setTimeout(initializeWhatsApp, RECONNECT_DELAY);
  });

  client.on('loading_screen', (percent, message) => {
    log.debug(`Carregando WhatsApp: ${percent}% - ${message}`);
  });

  client.on('message', async (msg) => {
    // Log de mensagens recebidas (opcional)
    log.debug(`📨 Mensagem recebida de ${msg.from}: ${msg.body.substring(0, 50)}...`);
  });
}

// ==========================================
// ENDPOINTS DA API
// ==========================================

// Health check
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    whatsapp: {
      ready: isReady,
      connecting: isConnecting,
      authenticated: client ? true : false,
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Status detalhado
app.get('/api/status', async (req, res) => {
  try {
    let phoneNumber = null;
    let pushName = null;

    if (isReady && client && client.info) {
      phoneNumber = client.info.wid?.user || null;
      pushName = client.info.pushname || null;
    }

    res.json({
      success: true,
      connected: isReady,
      connecting: isConnecting,
      canSendMessages: isReady,
      phone: phoneNumber,
      name: pushName,
      qrCode: !isReady ? lastQRCode : null,
      queue: messageQueueManager.getStats(),
      uptime: process.uptime(),
      connectionAttempts,
    });
  } catch (error) {
    log.error('Erro ao obter status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Enviar mensagem simples
app.post('/send', async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({
        success: false,
        error: 'Número e mensagem são obrigatórios',
      });
    }

    if (!isReady) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não está conectado. Por favor, aguarde a conexão.',
      });
    }

    log.info(`📤 Solicitação de envio para: ${number}`);

    // Adicionar à fila
    messageQueueManager.add({ number, message });

    res.json({
      success: true,
      message: 'Mensagem adicionada à fila de envio',
      queuePosition: messageQueueManager.queue.length,
    });

  } catch (error) {
    log.error('Erro ao processar envio:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Enviar produto cancelado
app.post('/send-product-canceled', async (req, res) => {
  try {
    const { phone, product_name, product_code } = req.body;

    if (!phone || !product_name) {
      return res.status(400).json({
        success: false,
        error: 'Telefone e nome do produto são obrigatórios',
      });
    }

    const message = `❌ *Produto Cancelado*\n\nO produto "${product_name}"${product_code ? ` (${product_code})` : ''} foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.`;

    messageQueueManager.add({ number: phone, message });

    res.json({
      success: true,
      message: 'Mensagem de cancelamento adicionada à fila',
    });

  } catch (error) {
    log.error('Erro ao enviar produto cancelado:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Broadcast por telefones
app.post('/api/broadcast/by-phones', async (req, res) => {
  try {
    const { phones, message, key, interval = 2000 } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Lista de telefones inválida',
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Mensagem é obrigatória',
      });
    }

    // Validação simples de key (opcional)
    if (key && key !== 'whatsapp-broadcast-2024') {
      log.warn('⚠️  Chave de broadcast inválida');
    }

    if (!isReady) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não está conectado',
      });
    }

    log.info(`📢 Broadcast para ${phones.length} números`);

    // Adicionar todos à fila
    phones.forEach(phone => {
      messageQueueManager.add({ number: phone, message });
    });

    res.json({
      success: true,
      total: phones.length,
      message: 'Mensagens adicionadas à fila de broadcast',
    });

  } catch (error) {
    log.error('Erro no broadcast:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Adicionar etiqueta (stub - WhatsApp Web.js tem suporte limitado)
app.post('/add-label', async (req, res) => {
  try {
    const { phone, label } = req.body;

    log.info(`🏷️  Solicitação de etiqueta "${label}" para ${phone}`);
    log.warn('⚠️  Funcionalidade de etiquetas tem suporte limitado no WhatsApp Web');

    res.json({
      success: true,
      message: 'Etiqueta registrada (funcionalidade limitada)',
    });

  } catch (error) {
    log.error('Erro ao adicionar etiqueta:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Estatísticas da fila
app.get('/api/queue/stats', (req, res) => {
  res.json({
    success: true,
    stats: messageQueueManager.getStats(),
  });
});

// Limpar fila
app.post('/api/queue/clear', (req, res) => {
  messageQueueManager.clear();
  res.json({
    success: true,
    message: 'Fila limpa com sucesso',
  });
});

// Logs (últimas 100 linhas)
const recentLogs = [];
const originalConsoleLog = console.log;
console.log = function(...args) {
  const logEntry = args.join(' ');
  recentLogs.push({
    timestamp: new Date().toISOString(),
    message: logEntry,
  });
  if (recentLogs.length > 100) {
    recentLogs.shift();
  }
  originalConsoleLog.apply(console, args);
};

app.get('/api/logs', (req, res) => {
  res.json({
    success: true,
    logs: recentLogs,
  });
});

// Status das mensagens
app.get('/api/message-status', (req, res) => {
  res.json({
    success: true,
    status: messageQueueManager.getStats(),
  });
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
async function gracefulShutdown(signal) {
  log.info(`\n🛑 Recebido sinal ${signal}. Encerrando gracefully...`);

  // Parar de processar novas mensagens
  messageQueueManager.clear();

  // Desconectar WhatsApp
  if (client) {
    try {
      log.info('Desconectando WhatsApp...');
      await client.destroy();
      log.success('WhatsApp desconectado com sucesso');
    } catch (error) {
      log.error('Erro ao desconectar WhatsApp:', error);
    }
  }

  // Fechar servidor HTTP
  server.close(() => {
    log.success('Servidor HTTP fechado');
    process.exit(0);
  });

  // Forçar saída após 10 segundos
  setTimeout(() => {
    log.warn('Forçando saída...');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  log.error('❌ Exceção não capturada:', error);
  // Não encerrar o processo, apenas logar
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('❌ Promise rejeitada não tratada:', reason);
  // Não encerrar o processo, apenas logar
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
async function start() {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀  SERVIDOR WHATSAPP ESTÁVEL E ROBUSTO v2.0       ║
║                                                       ║
║   📱 WhatsApp Web.js Integration                     ║
║   🔄 Auto-reconnect & Message Queue                  ║
║   ⚡ Optimized Performance                           ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);

  log.info('Iniciando limpeza...');
  await killOldProcesses();
  await sleep(2000);
  await cleanupSessionFiles();
  await sleep(1000);

  log.info(`🌐 Iniciando servidor HTTP na porta ${PORT}...`);
  const server = app.listen(PORT, () => {
    log.success(`✅ Servidor rodando em http://localhost:${PORT}`);
    log.info('📡 Endpoints disponíveis:');
    log.info('   GET  /status - Health check');
    log.info('   GET  /api/status - Status detalhado');
    log.info('   POST /send - Enviar mensagem');
    log.info('   POST /send-product-canceled - Produto cancelado');
    log.info('   POST /api/broadcast/by-phones - Broadcast');
    log.info('   GET  /api/queue/stats - Estatísticas da fila');
    log.info('   GET  /api/logs - Logs do servidor');
    log.info('');
    log.info('🔄 Inicializando WhatsApp...');
    initializeWhatsApp();
  });

  return server;
}

let server;
start().then(s => server = s).catch(error => {
  log.error('❌ Erro fatal ao iniciar:', error);
  process.exit(1);
});
