/**
 * WhatsApp Server v2 - Multi-Tenant
 * Sistema com triggers automáticos
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
const PORT = process.env.PORT || 3333;

// Supabase
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4';

// Multi-tenant storage
const tenantClients = new Map(); // tenantId -> WhatsApp Client
const tenantStatus = new Map();  // tenantId -> status
const tenantAuthDir = new Map(); // tenantId -> auth directory path

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
  
  console.log(`🔧 Criando cliente WhatsApp para: ${tenant.name} (${tenant.id})`);
  console.log(`📂 Diretório de autenticação: ${authDir}`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: `tenant_${tenant.id}`,
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
        '--disable-extensions'
      ],
      timeout: 0
    },
    qrMaxRetries: 5,
    authTimeoutMs: 0,
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0
  });

  client.on('qr', (qr) => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 QR CODE GERADO - ${tenant.name}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`\n⚠️ IMPORTANTE: O QR code está sendo exibido ABAIXO:\n`);
    qrcode.generate(qr, { small: true });
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Escaneie o QR code acima com seu WhatsApp`);
    console.log(`${'='.repeat(70)}\n`);
    tenantStatus.set(tenant.id, 'qr_code');
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ ${tenant.name} - Carregando: ${percent}%`);
  });

  client.on('ready', () => {
    console.log(`\n✅✅✅ WhatsApp CONECTADO: ${tenant.name} ✅✅✅\n`);
    tenantStatus.set(tenant.id, 'online');
  });

  client.on('authenticated', () => {
    console.log(`🔐 Autenticado: ${tenant.name}`);
    tenantStatus.set(tenant.id, 'authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error(`❌ Falha autenticação ${tenant.name}:`, msg);
    tenantStatus.set(tenant.id, 'auth_failure');
  });

  client.on('disconnected', (reason) => {
    console.log(`🔌 Desconectado ${tenant.name}:`, reason);
    tenantStatus.set(tenant.id, 'offline');
    
    // Tentar reconectar automaticamente após 10 segundos
    console.log(`🔄 Tentando reconectar ${tenant.name} em 10 segundos...`);
    setTimeout(async () => {
      try {
        console.log(`🔄 Reconectando ${tenant.name}...`);
        await client.initialize();
      } catch (error) {
        console.error(`❌ Erro ao reconectar ${tenant.name}:`, error.message);
      }
    }, 10000);
  });

  client.on('message', async (message) => {
    await handleIncomingMessage(tenant.id, message);
  });

  tenantClients.set(tenant.id, client);
  tenantStatus.set(tenant.id, 'initializing');
  
  console.log(`🔄 Iniciando WhatsApp Web para: ${tenant.name}...`);
  console.log(`⏰ Aguarde o QR Code aparecer (pode levar até 120 segundos)...`);
  console.log(`📂 Logs serão exibidos abaixo conforme o WhatsApp Web carregar...`);
  console.log(`💡 Se demorar muito, feche outros programas para liberar memória\n`);
  
  // Timeout de segurança de 2 minutos para Windows
  const initTimeout = setTimeout(() => {
    console.error(`\n⏱️ TIMEOUT: ${tenant.name} não gerou QR Code em 120 segundos`);
    console.error(`\n💡 Possíveis soluções:`);
    console.error(`   1. REINICIE o computador (limpa memória)`);
    console.error(`   2. FECHE todos os Chrome/Edge/Brave abertos`);
    console.error(`   3. DESATIVE antivírus temporariamente`);
    console.error(`   4. EXECUTE com menos tenants ativos`);
    console.error(`\n🔧 Para debug visual: node server-debug-visual.js`);
    console.error(`🔧 Para 1 tenant apenas: node server-simples-1-tenant.js\n`);
    tenantStatus.set(tenant.id, 'timeout');
  }, 120000);
  
  client.initialize()
    .then(() => {
      clearTimeout(initTimeout);
      console.log(`✅ Cliente inicializado: ${tenant.name}`);
    })
    .catch((error) => {
      clearTimeout(initTimeout);
      console.error(`\n❌ ERRO ao inicializar ${tenant.name}:`);
      console.error(`   Tipo: ${error.name}`);
      console.error(`   Mensagem: ${error.message}`);
      if (error.stack) {
        console.error(`\n📋 Stack trace completo:`);
        console.error(error.stack);
      }
      tenantStatus.set(tenant.id, 'error');
    });
  
  return client;
}

async function handleIncomingMessage(tenantId, message) {
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
      const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-multitenant/${tenantId}`;
      
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
  
  console.log(`📋 ${tenants.length} tenant(s) ativo(s)`);
  console.log(`⏱️ Inicializando tenants SEQUENCIALMENTE com delay de 20s entre cada...`);
  console.log(`⚠️ IMPORTANTE: Aguarde cada tenant conectar antes do próximo iniciar\n`);
  
  // Inicializar UM por vez com delay GRANDE
  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i];
    const integration = await getWhatsAppIntegration(tenant.id);
    
    if (integration) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🔧 [${i + 1}/${tenants.length}] Inicializando: ${tenant.name}`);
      console.log(`${'='.repeat(70)}\n`);
      
      createTenantClient(tenant);
      
      // Aguardar 20 segundos antes do próximo tenant (tempo para Chromium estabilizar)
      if (i < tenants.length - 1) {
        console.log(`\n⏳ Aguardando 20 segundos antes do próximo tenant...`);
        console.log(`💡 Isso evita sobrecarga de memória e garante estabilidade\n`);
        await delay(20000);
      }
    } else {
      console.log(`⚠️ Sem integração WhatsApp: ${tenant.name}`);
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ Processo de inicialização concluído!`);
  console.log(`📊 Verifique o status em: http://localhost:${PORT}/status`);
  console.log(`${'='.repeat(70)}\n`);
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
    return null;
  }
}

/* ============================ EXPRESS APP ============================ */
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors());

app.use((req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || req.body.tenant_id;
  if (tenantId) req.tenantId = tenantId;
  next();
});

/* ============================ ROUTES ============================ */

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

app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const status = tenantStatus.get(tenantId) || 'not_found';
  
  res.json({
    success: true,
    tenantId,
    status,
    hasClient: tenantClients.has(tenantId)
  });
});

app.post('/send', async (req, res) => {
  try {
    const { number, message, phone } = req.body;
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID obrigatório'
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
      console.error(`❌ [${tenantId}] Cliente não conectado ao tentar enviar para ${phoneNumber}`);
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado. Por favor, aguarde a conexão ou escaneie o QR Code.'
      });
    }
    
    const normalizedPhone = normalizeDDD(phoneNumber);
    const chatId = `${normalizedPhone}@c.us`;
    
    console.log(`📤 [${tenantId}] Tentando enviar para ${normalizedPhone}...`);
    
    try {
      await client.sendMessage(chatId, message);
      console.log(`✅ [${tenantId}] Mensagem enviada para ${normalizedPhone}`);
    } catch (sendError) {
      console.error(`❌ [${tenantId}] Erro ao enviar mensagem:`, sendError.message);
      throw new Error(`Erro ao enviar: ${sendError.message}`);
    }
    
    // Salvar no banco (não bloquear resposta se falhar)
    try {
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
    } catch (dbError) {
      console.error(`⚠️ [${tenantId}] Erro ao salvar no banco:`, dbError.message);
      // Não falha a requisição se apenas o log falhar
    }
    
    res.json({
      success: true,
      message: 'Mensagem enviada',
      phone: normalizedPhone
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
    const tenantId = req.tenantId;
    
    if (!tenantId || !phones || !Array.isArray(phones) || !message) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos'
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
        
        results.push({ phone: normalizedPhone, success: true });
        await delay(2000);
        
      } catch (error) {
        results.push({ phone: phone, success: false, error: error.message });
      }
    }
    
    res.json({
      success: true,
      total: phones.length,
      results
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/send-product-canceled', async (req, res) => {
  try {
    const { phone, product_name, product_code, tenant_id } = req.body;
    const tenantId = tenant_id || req.tenantId;
    
    if (!tenantId || !phone || !product_name) {
      return res.status(400).json({
        success: false,
        error: 'Dados obrigatórios faltando'
      });
    }
    
    let template;
    try {
      const templates = await supaRaw(`/whatsapp_templates?select=*&tenant_id=eq.${tenantId}&type=eq.PRODUCT_CANCELED&limit=1`);
      template = templates[0];
      
      if (!template) {
        template = {
          content: '❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato.'
        };
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro buscar template'
      });
    }
    
    let message = template.content
      .replace(/\{\{produto\}\}/g, product_name || 'Produto')
      .replace(/\{\{codigo\}\}/g, product_code || '');
    
    const client = await getTenantClient(tenantId);
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    const normalizedPhone = normalizeDDD(phone);
    const chatId = `${normalizedPhone}@c.us`;
    
    await client.sendMessage(chatId, message);
    
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
      message: 'Mensagem enviada',
      phone: normalizedPhone
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Listar todos os grupos do WhatsApp
app.get('/list-all-groups', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID obrigatório'
      });
    }
    
    const client = await getTenantClient(tenantId);
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    console.log(`📋 [${tenantId}] Listando grupos do WhatsApp...`);
    
    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(group => ({
        id: group.id._serialized,
        name: group.name,
        participantCount: group.participants ? group.participants.length : 0
      }));
    
    console.log(`✅ [${tenantId}] Encontrados ${groups.length} grupos`);
    
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

// Enviar mensagem para grupo específico
app.post('/send-to-group', async (req, res) => {
  try {
    const { groupId, message } = req.body;
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID obrigatório'
      });
    }
    
    if (!groupId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Group ID e mensagem obrigatórios'
      });
    }
    
    const client = await getTenantClient(tenantId);
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }
    
    console.log(`📤 [${tenantId}] Enviando mensagem para grupo ${groupId}`);
    
    await client.sendMessage(groupId, message);
    
    console.log(`✅ [${tenantId}] Mensagem enviada para grupo ${groupId}`);
    
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

// Iniciar job de envio
app.post('/sending-job/start', async (req, res) => {
  try {
    const { jobType, totalItems, jobData } = req.body;
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID obrigatório'
      });
    }
    
    const job = await supaRaw('/sending_jobs', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
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

// Atualizar job de envio
app.post('/sending-job/update', async (req, res) => {
  try {
    const { jobId, currentIndex, processedItems, status } = req.body;
    const tenantId = req.tenantId;
    
    if (!tenantId || !jobId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID e Job ID obrigatórios'
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
    version: '2.0'
  });
});

/* ============================ START ============================ */
async function startServer() {
  try {
    console.log('🚀 WhatsApp Server v2.0');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ Servidor online: http://localhost:${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status\n`);
    });
    
    initializeTenants();
    
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando...');
  
  for (const [tenantId, client] of tenantClients) {
    try {
      await client.destroy();
    } catch (error) {}
  }
  
  process.exit(0);
});

startServer();
