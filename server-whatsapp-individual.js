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

// Fetch polyfill para Node.js
if (typeof fetch !== 'function') {
  global.fetch = require('node-fetch');
}

/* ============================ CONFIGURAÇÃO DA EMPRESA ============================ */
const COMPANY_NAME = process.env.COMPANY_NAME || 'Mania de Mulher';
const TENANT_ID = process.env.TENANT_ID || '08f2b1b9-3988-489e-8186-c60f0c0b0622';
const PORT = process.env.PORT || 3333;

// Estrutura de pastas estável (evita EBUSY no Windows)
const PROGRAM_DATA = process.env.ORDERZAPS_PROGRAMDATA || 'C:\\ProgramData\\OrderZaps';
const AUTH_BASE = path.join(PROGRAM_DATA, '.wwebjs_auth');
const SESSION_DIR = path.join(AUTH_BASE, `session-${TENANT_ID}`);
const CACHE_BASE = path.join(PROGRAM_DATA, '.wwebjs_cache');

// Supabase
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

console.log(`\n${'='.repeat(60)}`);
console.log(`🚀 WhatsApp Server Individual - ${COMPANY_NAME}`);
console.log(`🆔 Tenant ID: ${TENANT_ID}`);
console.log(`🔌 Porta: ${PORT}`);
console.log(`📁 Sessão: ${SESSION_DIR}`);
console.log(`${'='.repeat(60)}\n`);

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Cria diretório com segurança (ignora se já existe)
function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch (error) {
    console.warn(`⚠️ Erro ao criar diretório ${p}:`, error.message);
    return false;
  }
}

// Remove arquivo/diretório com segurança (ignora EBUSY/EPERM)
function safeRm(p) {
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log(`🗑️ Removido: ${p}`);
      return true;
    }
    return true;
  } catch (error) {
    // Ignora erros EBUSY/EPERM no Windows (arquivo em uso)
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      console.warn(`⚠️ Arquivo em uso (ignorado): ${p}`);
      return false;
    }
    console.error(`❌ Erro ao remover ${p}:`, error.message);
    throw error;
  }
}

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
let currentQRCode = null;
let isReconnecting = false;

// Limpeza leve antes de inicializar (evita EBUSY)
function performStartupHygiene() {
  console.log('🧹 Executando limpeza leve...');
  
  // Criar estrutura de diretórios
  ensureDir(PROGRAM_DATA);
  ensureDir(AUTH_BASE);
  ensureDir(SESSION_DIR);
  
  // Remover lockfile (pode causar travamento)
  const lockfilePath = path.join(SESSION_DIR, 'lockfile');
  if (fs.existsSync(lockfilePath)) {
    safeRm(lockfilePath);
  }
  
  // Remover cache (pode estar corrompido)
  if (fs.existsSync(CACHE_BASE)) {
    safeRm(CACHE_BASE);
  }
  
  console.log('✅ Limpeza concluída');
}

// Limpeza completa da sessão (apenas em casos de LOGOUT/UNPAIRED)
async function wipeSessionWithRetry() {
  console.log('🗑️ Limpando sessão completa...');
  
  const delays = [500, 1000, 2000];
  
  for (const ms of delays) {
    await new Promise(r => setTimeout(r, ms));
    
    const ok1 = safeRm(SESSION_DIR);
    const ok2 = safeRm(CACHE_BASE);
    
    if (ok1 && ok2) {
      console.log('✅ Sessão limpa com sucesso');
      return true;
    }
    
    console.log(`⏳ Aguardando ${ms}ms para retry...`);
  }
  
  console.warn('⚠️ Não foi possível limpar completamente a sessão (arquivos em uso)');
  return false;
}

async function createWhatsAppClient() {
  // Limpeza leve antes de criar o cliente
  performStartupHygiene();
  
  console.log(`🔧 Criando cliente WhatsApp...`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: TENANT_ID,
      dataPath: AUTH_BASE
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-software-rasterizer'
      ]
    }
  });

  client.on('qr', (qr) => {
    console.log(`\n📱 QR CODE GERADO! Acesse http://localhost:${PORT} no navegador\n`);
    qrcode.generate(qr, { small: true });
    currentQRCode = qr;
    clientStatus = 'qr_code';
  });

  client.on('ready', () => {
    console.log(`✅ WhatsApp CONECTADO e PRONTO!`);
    currentQRCode = null;
    clientStatus = 'online';
    isReconnecting = false;
  });

  client.on('authenticated', () => {
    console.log(`🔐 Autenticado`);
    clientStatus = 'authenticated';
  });

  client.on('auth_failure', (msg) => {
    console.error(`❌ Falha autenticação:`, msg);
    clientStatus = 'auth_failure';
    currentQRCode = null;
  });

  // Handler de desconexão seguro (SEM logout)
  client.on('disconnected', async (reason) => {
    console.log(`🔌 Desconectado: ${reason}`);
    clientStatus = 'offline';
    currentQRCode = null;
    
    // Evita múltiplas tentativas simultâneas de reconexão
    if (isReconnecting) {
      console.log('⏭️ Reconexão já em andamento, ignorando...');
      return;
    }
    
    isReconnecting = true;
    
    try {
      // Destroy limpo (NÃO usar logout!)
      console.log('🔄 Destruindo cliente...');
      await client.destroy();
      
      // Verifica se é uma desconexão que requer limpeza completa
      const reasonStr = String(reason || '').toUpperCase();
      const mustWipe = ['LOGOUT', 'UNPAIRED', 'NAVIGATION'].includes(reasonStr);
      
      if (mustWipe) {
        console.log(`⚠️ Desconexão permanente detectada: ${reason}`);
        await wipeSessionWithRetry();
        clientStatus = 'qr_code';
      }
      
      // Aguarda 2s antes de reinicializar
      await delay(2000);
      
      // Reinicializar cliente
      console.log('🔄 Reinicializando cliente...');
      whatsappClient = null;
      await createWhatsAppClient();
      
    } catch (error) {
      console.error('❌ Erro ao reconectar:', error);
      clientStatus = 'error';
      isReconnecting = false;
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
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
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
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        .company {
            color: #667eea;
            font-size: 20px;
            margin-bottom: 30px;
        }
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
        .status-emoji {
            font-size: 32px;
        }
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
        .instructions {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 12px;
            margin-top: 20px;
        }
        .instructions h3 {
            color: #1976d2;
            margin-bottom: 10px;
        }
        .instructions ol {
            margin-left: 20px;
            color: #555;
            line-height: 1.8;
        }
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
        .refresh-btn:hover {
            background: #764ba2;
        }
        .loading {
            text-align: center;
            color: #666;
            padding: 40px;
        }
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
                <div class="info-label">Tenant ID</div>
                <div class="info-value">${TENANT_ID.substring(0, 8)}...</div>
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
        // Gerar QR Code
        QRCode.toCanvas(
            document.createElement('canvas'),
            '${currentQRCode}',
            {
                width: 280,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            },
            function (error, canvas) {
                if (error) {
                    console.error(error);
                    return;
                }
                document.getElementById('qrcode').appendChild(canvas);
            }
        );

        // Auto-refresh a cada 5 segundos se estiver aguardando QR
        setTimeout(() => location.reload(), 5000);
        ` : clientStatus === 'initializing' || clientStatus === 'authenticated' ? `
        // Auto-refresh a cada 3 segundos se estiver inicializando
        setTimeout(() => location.reload(), 3000);
        ` : ''}
    </script>
</body>
</html>
  `;

  res.send(html);
});

// Status geral (sem tenant_id)
app.get('/status', (req, res) => {
  res.json({
    success: true,
    company: COMPANY_NAME,
    tenant_id: TENANT_ID,
    status: clientStatus,
    connected: clientStatus === 'online',
    hasClient: !!whatsappClient,
    hasQR: !!currentQRCode,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Status por tenant_id (compatibilidade com frontend)
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  
  // Verifica se é o tenant correto
  if (tenantId !== TENANT_ID) {
    return res.status(404).json({
      success: false,
      error: 'Tenant não encontrado neste servidor',
      tenant_id: tenantId
    });
  }
  
  res.json({
    success: true,
    company: COMPANY_NAME,
    tenant_id: TENANT_ID,
    status: clientStatus,
    connected: clientStatus === 'online',
    hasClient: !!whatsappClient,
    hasQR: !!currentQRCode,
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

// Disconnect por tenant_id (compatibilidade com frontend)
// IMPORTANTE: NÃO usa logout() para evitar EBUSY no Windows
app.post('/disconnect/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  
  // Verifica se é o tenant correto
  if (tenantId !== TENANT_ID) {
    return res.status(404).json({
      success: false,
      error: 'Tenant não encontrado neste servidor'
    });
  }
  
  try {
    console.log(`🔌 Desconectando WhatsApp (sem logout)...`);
    
    if (whatsappClient) {
      // Usa destroy ao invés de logout (evita EBUSY)
      await whatsappClient.destroy();
      
      // Limpa sessão completamente
      await wipeSessionWithRetry();
      
      clientStatus = 'offline';
      currentQRCode = null;
      whatsappClient = null;
    }
    
    res.json({
      success: true,
      message: 'WhatsApp desconectado (sessão limpa)',
      status: clientStatus
    });
    
  } catch (error) {
    console.error('❌ Erro ao desconectar:', error);
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
