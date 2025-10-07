/**
 * server-whatsapp-individual-no-env.js — WhatsApp Multi-Tenant Server v2.0
 * Servidor WhatsApp otimizado com triggers automáticos do banco de dados
 * Compatível com todas as empresas (multi-tenant)
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

/* ============================ CONFIG ============================ */
const PORT = process.env.PORT || 3333;

// Supabase
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

// Multi-tenant storage
const tenantClients = new Map(); // tenantId -> WhatsApp Client
const tenantStatus = new Map();  // tenantId -> status
const tenantAuthDir = new Map(); // tenantId -> auth directory path
const tenantRetryCount = new Map(); // tenantId -> retry count
const MAX_RETRIES = 3; // Máximo de tentativas antes de desistir

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Normaliza número de telefone brasileiro para WhatsApp
 * - Remove caracteres não numéricos
 * - Adiciona DDI 55 se necessário
 * - Garante o 9º dígito para celulares
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
    } else {
      console.warn(`⚠️ DDD inválido: ${ddd} para telefone ${phone}`);
    }
  } else {
    console.warn(`⚠️ Telefone com comprimento inválido: ${normalized.length} dígitos`);
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
  return res.json();
}

async function loadTenants() {
  try {
    const tenants = await supaRaw('/tenants?select=id,name,slug,is_active&is_active=eq.true');
    return tenants;
  } catch (error) {
    console.error('❌ Erro ao carregar tenants:', error);
    return [];
  }
}

async function getWhatsAppIntegration(tenantId) {
  try {
    const integrations = await supaRaw(`/integration_whatsapp?select=*&tenant_id=eq.${tenantId}&is_active=eq.true&limit=1`);
    return integrations[0] || null;
  } catch (error) {
    console.error('❌ Erro ao carregar integração WhatsApp:', error);
    return null;
  }
}

/* ============================ WHATSAPP CLIENT MANAGEMENT ============================ */

/**
 * Verifica se o cache está corrompido
 */
function isCacheCorrupted(authDir) {
  try {
    // Verificar se a pasta existe
    if (!fs.existsSync(authDir)) {
      return false; // Não está corrompido, só não existe
    }
    
    // Verificar se há arquivos suspeitos ou vazios
    const sessionPath = path.join(authDir, 'session');
    if (fs.existsSync(sessionPath)) {
      const files = fs.readdirSync(sessionPath);
      
      // Se não há arquivos, está corrompido
      if (files.length === 0) {
        console.log(`⚠️ Cache corrompido: pasta session vazia`);
        return true;
      }
      
      // Verificar arquivos específicos que podem estar corrompidos
      for (const file of files) {
        const filePath = path.join(sessionPath, file);
        try {
          const stats = fs.statSync(filePath);
          // Se arquivo tem 0 bytes, está corrompido
          if (stats.size === 0) {
            console.log(`⚠️ Cache corrompido: arquivo vazio ${file}`);
            return true;
          }
        } catch (e) {
          console.log(`⚠️ Cache corrompido: erro ao ler ${file}`);
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Erro ao verificar cache:`, error.message);
    return true; // Em caso de dúvida, considerar corrompido
  }
}

/**
 * Limpa cache corrompido do WhatsApp Web
 */
function cleanCorruptedCache(authDir) {
  try {
    console.log(`🧹 Limpando cache corrompido: ${authDir}`);
    
    // Tentar múltiplas vezes se necessário
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        // Deletar pasta inteira se existir
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true, maxRetries: 3 });
          console.log(`✅ Cache deletado (tentativa ${attempts + 1})`);
        }
        
        // Pequeno delay para garantir que o sistema operacional liberou os arquivos
        const start = Date.now();
        while (Date.now() - start < 500) { } // Busy wait de 500ms
        
        // Recriar pasta limpa
        fs.mkdirSync(authDir, { recursive: true });
        console.log(`✅ Pasta recriada limpa`);
        
        return true;
      } catch (retryError) {
        attempts++;
        console.warn(`⚠️ Tentativa ${attempts} falhou: ${retryError.message}`);
        
        if (attempts >= maxAttempts) {
          throw retryError;
        }
        
        // Aguardar antes de tentar novamente
        const start = Date.now();
        while (Date.now() - start < 1000) { } // Busy wait de 1s
      }
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Erro ao limpar cache:`, error.message);
    return false;
  }
}

function getTenantAuthDir(tenantId) {
  const baseDir = path.join(__dirname, '.wwebjs_auth_v2');
  const tenantDir = path.join(baseDir, `tenant_${tenantId}`);
  
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  
  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }
  
  return tenantDir;
}

async function createTenantClient(tenant) {
  const authDir = getTenantAuthDir(tenant.id);
  tenantAuthDir.set(tenant.id, authDir);
  
  // Verificar contador de tentativas
  const retryCount = tenantRetryCount.get(tenant.id) || 0;
  if (retryCount >= MAX_RETRIES) {
    console.error(`❌ Máximo de tentativas atingido para ${tenant.name}`);
    console.error(`   Não será feita nova tentativa automática.`);
    console.error(`   SOLUÇÃO: Delete manualmente a pasta: ${authDir}`);
    console.error(`   Depois chame: POST /restart/${tenant.id}`);
    tenantStatus.set(tenant.id, 'max_retries_exceeded');
    return null;
  }
  
  console.log(`🔧 Criando cliente WhatsApp para: ${tenant.name} (${tenant.id})`);
  console.log(`📂 Diretório de autenticação: ${authDir}`);
  console.log(`🔄 Tentativa: ${retryCount + 1}/${MAX_RETRIES}`);
  
  // SOLUÇÃO RADICAL: SEMPRE limpar cache antes de inicializar
  // Isso força autenticação via QR code, mas evita erros de cache corrompido
  console.log(`🧹 LIMPEZA PREVENTIVA: Deletando cache antigo para evitar corrupção...`);
  
  const cleaned = cleanCorruptedCache(authDir);
  if (!cleaned) {
    console.error(`❌ Falha ao limpar cache`);
    console.error(`   SOLUÇÃO MANUAL: Delete a pasta: ${authDir}`);
    console.error(`   Use: rmdir /s /q "${authDir}"`);
    tenantStatus.set(tenant.id, 'cache_clean_failed');
    return null;
  }
  
  console.log(`✅ Cache limpo com sucesso`);
  console.log(`📱 Um novo QR Code será gerado - você precisará escanear novamente`);
  console.log(`🌐 Configurando Puppeteer...`);
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: `tenant_${tenant.id}`,
      dataPath: authDir
    }),
    puppeteer: {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      defaultViewport: null,
      timeout: 60000
    }
  });
  
  console.log(`✅ Cliente criado, configurando eventos...`);

  // Setup events com logs detalhados
  console.log(`📝 Configurando eventos para: ${tenant.name}`);
  
  client.on('qr', (qr) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📱 QR CODE GERADO PARA: ${tenant.name}`);
    console.log(`📱 ESCANEIE O QR CODE NO NAVEGADOR PUPPETEER`);
    console.log(`${'='.repeat(60)}`);
    qrcode.generate(qr, { small: true });
    console.log(`${'='.repeat(60)}\n`);
    console.log(`✅ QR Code também deve aparecer na janela do navegador`);
    tenantStatus.set(tenant.id, 'qr_code');
  });
  
  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ ${tenant.name} - Loading: ${percent}% - ${message}`);
  });

  client.on('ready', () => {
    console.log(`✅ WhatsApp CONECTADO: ${tenant.name}`);
    tenantStatus.set(tenant.id, 'online');
  });

  client.on('authenticated', () => {
    console.log(`🔐 Autenticado: ${tenant.name}`);
    tenantStatus.set(tenant.id, 'authenticated');
  });

  client.on('auth_failure', async (msg) => {
    console.error(`❌ Falha autenticação ${tenant.name}:`, msg);
    console.error(`💡 SOLUÇÃO: Limpando cache corrompido...`);
    
    tenantStatus.set(tenant.id, 'auth_failure');
    
    // Incrementar contador de tentativas
    const currentRetries = tenantRetryCount.get(tenant.id) || 0;
    tenantRetryCount.set(tenant.id, currentRetries + 1);
    
    // Verificar se já atingiu o máximo
    if (currentRetries + 1 >= MAX_RETRIES) {
      console.error(`❌ Máximo de tentativas de reconexão atingido para ${tenant.name}`);
      console.error(`   Não será feita nova tentativa automática.`);
      tenantStatus.set(tenant.id, 'max_retries_exceeded');
      
      // Destruir cliente
      try {
        await client.destroy();
      } catch (e) {
        console.log(`⚠️ Erro ao destruir cliente: ${e.message}`);
      }
      tenantClients.delete(tenant.id);
      return;
    }
    
    // Limpar cache imediatamente
    const cleaned = cleanCorruptedCache(authDir);
    
    if (!cleaned) {
      console.error(`❌ Falha ao limpar cache`);
      tenantStatus.set(tenant.id, 'cache_clean_failed');
      return;
    }
    
    console.log(`✅ Cache limpo, aguardando 10 segundos antes de reconectar...`);
    
    // Aguardar mais tempo antes de reconectar (10s)
    await delay(10000);
    
    try {
      // Destruir cliente antigo
      await client.destroy();
      tenantClients.delete(tenant.id);
      
      // Criar novo cliente
      console.log(`🔄 Recriando cliente ${tenant.name}...`);
      await createTenantClient(tenant);
    } catch (error) {
      console.error(`❌ Erro ao recriar cliente:`, error.message);
      tenantStatus.set(tenant.id, 'reconnect_failed');
    }
  });

  client.on('disconnected', async (reason) => {
    console.log(`🔌 Desconectado ${tenant.name}:`, reason);
    tenantStatus.set(tenant.id, 'offline');
    
    // Incrementar contador de desconexões
    const currentRetries = tenantRetryCount.get(tenant.id) || 0;
    
    // Se foi um logout ou navegação, limpar cache e tentar reconectar
    if (reason === 'LOGOUT' || reason === 'NAVIGATION' || reason === 'CONFLICT') {
      console.log(`🧹 Limpando cache após desconexão: ${reason}`);
      
      const cleaned = cleanCorruptedCache(authDir);
      
      if (cleaned && currentRetries < MAX_RETRIES) {
        console.log(`✅ Cache limpo, tentando reconectar em 10 segundos...`);
        tenantRetryCount.set(tenant.id, currentRetries + 1);
        
        await delay(10000);
        
        try {
          // Destruir cliente antigo
          await client.destroy();
          tenantClients.delete(tenant.id);
          
          // Criar novo cliente
          console.log(`🔄 Recriando cliente ${tenant.name} após desconexão...`);
          await createTenantClient(tenant);
        } catch (error) {
          console.error(`❌ Erro ao reconectar após desconexão:`, error.message);
        }
      } else if (currentRetries >= MAX_RETRIES) {
        console.error(`❌ Máximo de tentativas atingido após desconexão`);
        tenantStatus.set(tenant.id, 'max_retries_exceeded');
      }
    }
  });

  client.on('message', async (message) => {
    await handleIncomingMessage(tenant.id, message);
  });

  tenantClients.set(tenant.id, client);
  tenantStatus.set(tenant.id, 'initializing');
  
  console.log(`🔄 Iniciando cliente WhatsApp para: ${tenant.name}`);
  console.log(`⏰ Aguardando inicialização... (timeout: 120s)`);
  console.log(`📂 Diretório de autenticação: ${authDir}`);
  console.log(`💡 DICA: Se não aparecer QR code, delete a pasta: ${authDir}`);
  
  // Adicionar timeout de segurança
  const timeoutId = setTimeout(() => {
    console.error(`⏱️ TIMEOUT: Cliente ${tenant.name} não inicializou em 120 segundos`);
    console.error(`   Possíveis causas:`);
    console.error(`   - WhatsApp Web não carregou completamente`);
    console.error(`   - Sessão antiga corrompida (delete a pasta: ${authDir})`);
    console.error(`   - Problemas de rede com WhatsApp Web`);
    console.error(`   - Chromium/Puppeteer travado`);
    tenantStatus.set(tenant.id, 'timeout');
  }, 120000);
  
  // Incrementar contador de tentativas
  tenantRetryCount.set(tenant.id, (tenantRetryCount.get(tenant.id) || 0) + 1);
  
  // Inicializar cliente
  client.initialize().catch(async (error) => {
    clearTimeout(timeoutId);
    console.error(`❌ ERRO ao inicializar ${tenant.name}:`);
    console.error(`   Tipo: ${error.name}`);
    console.error(`   Mensagem: ${error.message}`);
    
    // Detectar erros de cache corrompido
    const isCorruptedCache = 
      error.message?.includes('Cannot read properties of null') ||
      error.message?.includes('Execution context was destroyed') ||
      error.message?.includes('Protocol error') ||
      error.message?.includes('Target closed') ||
      error.name === 'ProtocolError';
    
    if (isCorruptedCache) {
      console.error(`\n🧹 Cache corrompido detectado! Limpando automaticamente...`);
      
      const cleaned = cleanCorruptedCache(authDir);
      
      if (cleaned) {
        const currentRetries = tenantRetryCount.get(tenant.id) || 0;
        
        if (currentRetries < MAX_RETRIES) {
          console.log(`✅ Cache limpo! Reiniciando cliente em 10 segundos...`);
          console.log(`🔄 Tentativa ${currentRetries}/${MAX_RETRIES}`);
          tenantStatus.set(tenant.id, 'restarting');
          
          await delay(10000);
          
          try {
            // Remover cliente antigo
            tenantClients.delete(tenant.id);
            
            // Criar novo cliente
            console.log(`🔄 Recriando cliente ${tenant.name}...`);
            await createTenantClient(tenant);
          } catch (retryError) {
            console.error(`❌ Erro ao recriar cliente:`, retryError.message);
            tenantStatus.set(tenant.id, 'error');
          }
        } else {
          console.error(`❌ Máximo de ${MAX_RETRIES} tentativas atingido`);
          console.error(`   Não será feita nova tentativa automática.`);
          console.error(`   SOLUÇÃO MANUAL: DELETE a pasta: ${authDir}`);
          console.error(`   Depois reinicie via: POST /restart/${tenant.id}`);
          tenantStatus.set(tenant.id, 'max_retries_exceeded');
        }
      } else {
        console.error(`❌ Não foi possível limpar o cache automaticamente`);
        console.error(`   SOLUÇÃO MANUAL: DELETE a pasta: ${authDir}`);
        console.error(`   Use o comando: rmdir /s /q "${authDir}"`);
        console.error(`   Depois reinicie via: POST /restart/${tenant.id}`);
        tenantStatus.set(tenant.id, 'cache_clean_failed');
      }
    } else {
      console.error(`❌ Erro desconhecido. Verifique os logs.`);
      console.error(`   Stack: ${error.stack}`);
      tenantStatus.set(tenant.id, 'error');
    }
  });
  
  return client;
}

async function handleIncomingMessage(tenantId, message) {
  try {
    let groupName = null;
    let authorPhone = null;
    let messageFrom = message.from;
    
    console.log(`📨 [${tenantId}] Mensagem recebida:`, {
      from: message.from,
      body: message.body?.substring(0, 50),
      hasAuthor: !!message.author
    });

    // Verificar se é mensagem de grupo
    if (message.from && message.from.includes('@g.us')) {
      try {
        const chat = await message.getChat();
        if (chat && chat.isGroup) {
          groupName = chat.name || 'Grupo WhatsApp';
          console.log(`📱 Grupo: ${groupName}`);
          
          if (message.author) {
            authorPhone = message.author.replace('@c.us', '');
            messageFrom = message.author;
            console.log(`👤 Autor: ${authorPhone}`);
          } else {
            console.log(`⚠️ Mensagem grupo sem author`);
            return;
          }
        }
      } catch (chatError) {
        console.error('❌ Erro obter grupo:', chatError.message);
      }
    } else {
      authorPhone = message.from.replace('@c.us', '');
    }

    if (!authorPhone) {
      console.log(`⚠️ Telefone inválido`);
      return;
    }

    // Webhook payload
    const webhookPayload = {
      from: messageFrom,
      body: message.body || '',
      groupName: groupName,
      author: authorPhone,
      chatName: groupName
    };

    console.log(`🔗 Enviando webhook:`, { tenant: tenantId, author: authorPhone });

    // Chamar edge function webhook
    try {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-multitenant/${tenantId}`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      });

      if (response.ok) {
        console.log(`✅ Webhook enviado: ${response.status}`);
      } else {
        console.log(`⚠️ Webhook status: ${response.status}`);
      }
    } catch (webhookError) {
      console.error('❌ Erro webhook:', webhookError.message);
    }

    // Log no banco (mensagem recebida)
    try {
      await supaRaw('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          phone: authorPhone,
          message: message.body || '',
          type: 'incoming',
          received_at: new Date().toISOString(),
          whatsapp_group_name: groupName
        })
      });
      console.log(`💾 Mensagem salva`);
    } catch (dbError) {
      console.error('❌ Erro salvar banco:', dbError.message);
    }

  } catch (error) {
    console.error('❌ Erro processar mensagem:', error.message);
  }
}

/* ============================ TENANT MANAGEMENT ============================ */
async function initializeTenants() {
  console.log('🏢 Carregando tenants...');
  const tenants = await loadTenants();
  
  if (tenants.length === 0) {
    console.log('⚠️ Nenhum tenant ativo encontrado');
    return;
  }
  
  console.log(`📋 Encontrados ${tenants.length} tenant(s) ativo(s)`);
  
  // Inicializar todos os clientes em paralelo (não bloqueia)
  for (const tenant of tenants) {
    const integration = await getWhatsAppIntegration(tenant.id);
    
    if (integration) {
      console.log(`🔧 Inicializando: ${tenant.name}`);
      createTenantClient(tenant); // Sem await - não bloqueia
    } else {
      console.log(`⚠️ Sem integração WhatsApp: ${tenant.name}`);
    }
  }
  
  console.log(`✅ Inicialização dos clientes WhatsApp em andamento...`);
}

async function getTenantClient(tenantId) {
  const client = tenantClients.get(tenantId);
  const status = tenantStatus.get(tenantId);
  
  if (!client || status !== 'online') {
    return null;
  }
  
  try {
    const state = await client.getState();
    return state === 'CONNECTED' ? client : null;
  } catch (error) {
    console.error(`❌ Erro verificar estado ${tenantId}:`, error);
    return null;
  }
}

/* ============================ EXPRESS APP ============================ */
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors());

// Middleware tenant ID
app.use((req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || req.body.tenant_id;
  if (tenantId) req.tenantId = tenantId;
  next();
});

/* ============================ ROUTES ============================ */

// Status geral
app.get('/status', (req, res) => {
  const status = {};
  
  for (const [tenantId, client] of tenantClients) {
    status[tenantId] = {
      status: tenantStatus.get(tenantId) || 'unknown',
      hasClient: !!client
    };
  }
  
  res.json({
    success: true,
    tenants: status,
    totalTenants: tenantClients.size
  });
});

// Status por tenant
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const status = tenantStatus.get(tenantId) || 'not_found';
  const hasClient = tenantClients.has(tenantId);
  
  res.json({
    success: true,
    tenantId,
    status,
    hasClient
  });
});

// Enviar mensagem simples
app.post('/send', async (req, res) => {
  try {
    const { number, message, phone } = req.body;
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID obrigatório (headers: x-tenant-id ou body: tenant_id)'
      });
    }
    
    const phoneNumber = number || phone;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'Número e mensagem obrigatórios'
      });
    }
    
    const client = await getTenantClient(tenantId);
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado para este tenant'
      });
    }
    
    const normalizedPhone = normalizeDDD(phoneNumber);
    const chatId = `${normalizedPhone}@c.us`;
    
    console.log(`📤 [${tenantId}] Enviando para ${normalizedPhone}`);
    await client.sendMessage(chatId, message);
    console.log(`✅ [${tenantId}] Enviado com sucesso`);
    
    // Log no banco
    await supaRaw('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: message,
        type: 'outgoing',
        sent_at: new Date().toISOString()
      })
    });
    
    res.json({
      success: true,
      message: 'Mensagem enviada',
      phone: normalizedPhone
    });
    
  } catch (error) {
    console.error(`❌ Erro enviar mensagem:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Broadcast para múltiplos números
app.post('/broadcast', async (req, res) => {
  try {
    const { phones, message } = req.body;
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID obrigatório'
      });
    }
    
    if (!phones || !Array.isArray(phones) || !message) {
      return res.status(400).json({
        success: false,
        error: 'Lista de telefones e mensagem obrigatórios'
      });
    }
    
    const client = await getTenantClient(tenantId);
    
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
        
        // Log no banco
        await supaRaw('/whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: tenantId,
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
        
        // Delay anti-bloqueio
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

// Reinicializar cliente tenant
app.post('/restart/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    console.log(`🔄 Solicitação de restart para: ${tenantId}`);
    
    // Resetar contador de tentativas
    tenantRetryCount.delete(tenantId);
    console.log(`✅ Contador de tentativas resetado`);
    
    // Desconectar existente
    const existingClient = tenantClients.get(tenantId);
    if (existingClient) {
      try {
        console.log(`🔌 Destruindo cliente existente...`);
        await existingClient.destroy();
      } catch (error) {
        console.warn(`⚠️ Erro destruir cliente: ${error.message}`);
      }
    }
    
    // Limpar cache antes de reiniciar
    const authDir = tenantAuthDir.get(tenantId) || getTenantAuthDir(tenantId);
    console.log(`🧹 Limpando cache: ${authDir}`);
    cleanCorruptedCache(authDir);
    
    // Carregar tenant
    const tenants = await supaRaw(`/tenants?select=*&id=eq.${tenantId}&is_active=eq.true&limit=1`);
    const tenant = tenants[0];
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant não encontrado'
      });
    }
    
    // Verificar integração
    const integration = await getWhatsAppIntegration(tenantId);
    if (!integration) {
      return res.status(400).json({
        success: false,
        error: 'Sem integração WhatsApp ativa'
      });
    }
    
    // Criar novo cliente
    console.log(`🔧 Criando novo cliente...`);
    await createTenantClient(tenant);
    
    res.json({
      success: true,
      message: `Cliente reinicializado: ${tenant.name}`,
      tenantId: tenantId,
      info: 'Cache limpo e contador resetado'
    });
    
  } catch (error) {
    console.error('❌ Erro reinicializar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    version: '2.0',
    timestamp: new Date().toISOString()
  });
});

// Enviar mensagem de produto cancelado (com template)
app.post('/send-product-canceled', async (req, res) => {
  try {
    const { phone, product_name, product_code, tenant_id } = req.body;
    const tenantId = tenant_id || req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID obrigatório (headers: x-tenant-id ou body: tenant_id)'
      });
    }
    
    if (!phone || !product_name) {
      return res.status(400).json({
        success: false,
        error: 'Telefone e nome do produto obrigatórios'
      });
    }
    
    // Buscar template PRODUCT_CANCELED do banco
    console.log(`🔍 [${tenantId}] Buscando template PRODUCT_CANCELED...`);
    let template;
    try {
      const templates = await supaRaw(`/whatsapp_templates?select=*&tenant_id=eq.${tenantId}&type=eq.PRODUCT_CANCELED&limit=1`);
      template = templates[0];
      
      if (!template) {
        console.log(`⚠️ Template PRODUCT_CANCELED não encontrado, usando padrão`);
        template = {
          content: '❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.'
        };
      } else {
        console.log(`✅ Template encontrado: ${template.title || 'PRODUCT_CANCELED'}`);
      }
    } catch (templateError) {
      console.error('❌ Erro buscar template:', templateError);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar template'
      });
    }
    
    // Substituir variáveis no template
    let message = template.content
      .replace(/\{\{produto\}\}/g, product_name || 'Produto')
      .replace(/\{\{codigo\}\}/g, product_code || '');
    
    console.log(`📝 [${tenantId}] Mensagem preparada:`, message.substring(0, 100));
    
    // Buscar cliente WhatsApp
    const client = await getTenantClient(tenantId);
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado para este tenant'
      });
    }
    
    // Normalizar telefone e enviar
    const normalizedPhone = normalizeDDD(phone);
    const chatId = `${normalizedPhone}@c.us`;
    
    console.log(`📤 [${tenantId}] Enviando produto cancelado para ${normalizedPhone}`);
    await client.sendMessage(chatId, message);
    console.log(`✅ [${tenantId}] Mensagem de produto cancelado enviada`);
    
    // Log no banco
    await supaRaw('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: message,
        type: 'outgoing',
        product_name: product_name,
        sent_at: new Date().toISOString()
      })
    });
    
    res.json({
      success: true,
      message: 'Mensagem de produto cancelado enviada',
      phone: normalizedPhone
    });
    
  } catch (error) {
    console.error(`❌ Erro enviar produto cancelado:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* ============================ SERVER START ============================ */
async function startServer() {
  try {
    console.log('🚀 Iniciando WhatsApp Server v2.0...');
    console.log('📋 Sistema de triggers automáticos ativado');
    
    // Iniciar servidor HTTP PRIMEIRO
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🌐 SERVIDOR HTTP ONLINE`);
      console.log(`${'='.repeat(70)}`);
      console.log(`📍 Acesso local: http://localhost:${PORT}`);
      console.log(`📍 Acesso rede: http://192.168.1.20:${PORT}`);
      console.log(`📊 Status: http://192.168.1.20:${PORT}/status`);
      console.log(`💚 Health: http://192.168.1.20:${PORT}/health`);
      console.log(`${'='.repeat(70)}`);
      console.log(`\n⚠️  IMPORTANTE: Configure a URL no sistema como http://192.168.1.20:${PORT}`);
      console.log(`\n📱 Agora os clientes WhatsApp serão inicializados em background...`);
      console.log(`   Se aparecer um QR Code, escaneie com seu WhatsApp!\n`);
    });
    
    // Inicializar clientes WhatsApp em background (não bloqueia)
    initializeTenants().catch(error => {
      console.error('❌ Erro ao inicializar tenants:', error);
    });
    
  } catch (error) {
    console.error('❌ Erro iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando...');
  
  for (const [tenantId, client] of tenantClients) {
    try {
      console.log(`🔌 Desconectando ${tenantId}...`);
      await client.destroy();
    } catch (error) {
      console.warn(`⚠️ Erro desconectar ${tenantId}:`, error.message);
    }
  }
  
  process.exit(0);
});

// Proteção contra erros não tratados
process.on('uncaughtException', (error) => {
  console.error('\n❌ ERRO NÃO TRATADO:');
  console.error(`   Tipo: ${error.name}`);
  console.error(`   Mensagem: ${error.message}`);
  console.error(`   Stack: ${error.stack}`);
  
  // Se for erro de cache corrompido, tentar limpar
  if (error.message?.includes('Cannot read properties of null')) {
    console.error('\n🧹 Detectado erro de cache corrompido');
    console.error('   Limpando todos os caches...');
    
    for (const [tenantId, authDir] of tenantAuthDir) {
      try {
        cleanCorruptedCache(authDir);
        console.log(`✅ Cache limpo para tenant: ${tenantId}`);
      } catch (cleanError) {
        console.error(`❌ Erro ao limpar cache do tenant ${tenantId}:`, cleanError.message);
      }
    }
    
    console.error('\n💡 SOLUÇÃO: Reinicie o servidor agora');
  }
  
  // Não encerrar o processo, apenas logar
  console.error('\n⚠️ Servidor continua rodando, mas pode estar instável');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ PROMISE REJEITADA NÃO TRATADA:');
  console.error(`   Motivo:`, reason);
  console.error(`   Promise:`, promise);
  
  // Se for erro de cache corrompido, logar
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const errorMessage = reason.message;
    if (errorMessage?.includes('Cannot read properties of null') || 
        errorMessage?.includes('Execution context was destroyed')) {
      console.error('\n🧹 Detectado erro de cache corrompido via Promise');
      console.error('   Os caches serão limpos na próxima reconexão automática');
    }
  }
});

startServer();
