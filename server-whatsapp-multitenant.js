/**
 * server-whatsapp-multitenant.js — WhatsApp Multi-Tenant Server
 * Servidor WhatsApp separado por empresa (tenant)
 * Node 18+ | whatsapp-web.js | express | cors
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
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

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function normalizeDDD(phone) {
  if (!phone) return phone;
  const cleanPhone = phone.replace(/\D/g, '');
  let normalizedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  
  if (normalizedPhone.length >= 4) {
    const ddd = parseInt(normalizedPhone.substring(2, 4));
    const restOfNumber = normalizedPhone.substring(4);
    
    if (ddd < 31 && !restOfNumber.startsWith('9') && restOfNumber.length === 8) {
      normalizedPhone = normalizedPhone.substring(0, 4) + '9' + normalizedPhone.substring(4);
    } else if (ddd >= 31 && restOfNumber.startsWith('9') && restOfNumber.length === 9) {
      normalizedPhone = normalizedPhone.substring(0, 4) + normalizedPhone.substring(5);
    }
  }
  
  return normalizedPhone;
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
  const baseDir = path.join(__dirname, '.wwebjs_auth_tenants');
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
  
  console.log(`🔧 Criando cliente WhatsApp para tenant: ${tenant.name} (${tenant.id})`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: `tenant_${tenant.id}`,
      dataPath: authDir
    }),
    puppeteer: {
      headless: true,
      devtools: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  // Setup client events
  client.on('qr', (qr) => {
    console.log(`📱 QR Code para ${tenant.name}:`);
    qrcode.generate(qr, { small: true });
    tenantStatus.set(tenant.id, 'qr_code');
  });

  client.on('ready', () => {
    console.log(`✅ Cliente WhatsApp conectado para ${tenant.name}`);
    tenantStatus.set(tenant.id, 'online');
  });

  client.on('authenticated', () => {
    console.log(`🔐 Cliente autenticado para ${tenant.name}`);
    tenantStatus.set(tenant.id, 'authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error(`❌ Falha na autenticação para ${tenant.name}:`, msg);
    tenantStatus.set(tenant.id, 'auth_failure');
  });

  client.on('disconnected', (reason) => {
    console.log(`🔌 Cliente desconectado para ${tenant.name}:`, reason);
    tenantStatus.set(tenant.id, 'offline');
  });

  client.on('message', async (message) => {
    await handleIncomingMessage(tenant.id, message);
  });

  tenantClients.set(tenant.id, client);
  tenantStatus.set(tenant.id, 'initializing');
  
  try {
    await client.initialize();
    console.log(`🚀 Cliente inicializado para ${tenant.name}`);
  } catch (error) {
    console.error(`❌ Erro ao inicializar cliente para ${tenant.name}:`, error);
    tenantStatus.set(tenant.id, 'error');
  }
  
  return client;
}

async function handleIncomingMessage(tenantId, message) {
  try {
    let groupName = null;
    let authorPhone = null;
    let messageFrom = message.from;
    
    console.log(`📨 Mensagem recebida para tenant ${tenantId}:`, {
      from: message.from,
      body: message.body,
      hasAuthor: !!message.author
    });

    // Verificar se é mensagem de grupo
    if (message.from && message.from.includes('@g.us')) {
      try {
        // Obter chat para pegar nome do grupo
        const chat = await message.getChat();
        if (chat && chat.isGroup) {
          groupName = chat.name || 'Grupo WhatsApp';
          console.log(`📱 Grupo identificado: ${groupName}`);
          
          // Para grupos, usar o author como remetente individual
          if (message.author) {
            authorPhone = message.author.replace('@c.us', '');
            messageFrom = message.author;
            console.log(`👤 Autor do grupo: ${authorPhone}`);
          } else {
            console.log(`⚠️ Mensagem de grupo sem author definido`);
            // Se não temos o author, vamos ignorar esta mensagem para evitar dados inválidos
            return;
          }
        }
      } catch (chatError) {
        console.error('❌ Erro ao obter informações do grupo:', chatError.message);
        // Em caso de erro, tratar como mensagem individual
      }
    } else {
      // Mensagem individual - usar o from normalmente
      authorPhone = message.from.replace('@c.us', '');
    }

    // Se não conseguimos determinar um telefone válido, não processar
    if (!authorPhone) {
      console.log(`⚠️ Não foi possível determinar telefone válido para a mensagem`);
      return;
    }

    // Preparar payload para webhook
    const webhookPayload = {
      from: messageFrom,
      body: message.body || '',
      groupName: groupName,
      author: authorPhone,
      chatName: groupName
    };

    console.log(`🔗 Enviando para webhook:`, webhookPayload);

    // Chamar webhook se configurado
    try {
      const webhookUrl = `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-multitenant/${tenantId}`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload)
      });

      if (response.ok) {
        const result = await response.text();
        console.log(`✅ Webhook enviado com sucesso:`, response.status);
      } else {
        console.log(`⚠️ Webhook retornou status:`, response.status);
      }
    } catch (webhookError) {
      console.error('❌ Erro ao chamar webhook:', webhookError.message);
    }

    // Log da mensagem recebida no banco
    try {
      await supaRaw('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          phone: authorPhone,
          message: message.body || '',
          type: 'received',
          received_at: new Date().toISOString(),
          whatsapp_group_name: groupName
        })
      });
      console.log(`💾 Mensagem salva no banco`);
    } catch (dbError) {
      console.error('❌ Erro ao salvar no banco:', dbError.message);
    }

  } catch (error) {
    console.error('❌ Erro geral ao processar mensagem:', error.message);
    console.error('Stack:', error.stack);
  }
}

/* ============================ TENANT MANAGEMENT ============================ */
async function initializeTenants() {
  console.log('🏢 Carregando tenants...');
  const tenants = await loadTenants();
  
  for (const tenant of tenants) {
    const integration = await getWhatsAppIntegration(tenant.id);
    
    if (integration) {
      console.log(`🔧 Inicializando WhatsApp para tenant: ${tenant.name}`);
      await createTenantClient(tenant);
    } else {
      console.log(`⚠️ Nenhuma integração WhatsApp ativa para tenant: ${tenant.name}`);
    }
  }
}

async  function getTenantClient(tenantId) {
  const client = tenantClients.get(tenantId);
  const status = tenantStatus.get(tenantId);
  
  if (!client || status !== 'online') {
    return null;
  }
  
  try {
    const state = await client.getState();
    return state === 'CONNECTED' ? client : null;
  } catch (error) {
    console.error(`❌ Erro ao verificar estado do cliente ${tenantId}:`, error);
    return null;
  }
}

/* ============================ EXPRESS APP ============================ */
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors());

// Middleware para identificar tenant
app.use(async (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  
  if (tenantId) {
    req.tenantId = tenantId;
  }
  
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

// Status específico do tenant
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

// Enviar mensagem
app.post('/send', async (req, res) => {
  try {
    const { phone, message, tenantId: bodyTenantId } = req.body;
    const tenantId = req.tenantId || bodyTenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID é obrigatório'
      });
    }
    
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Telefone e mensagem são obrigatórios'
      });
    }
    
    const client = await getTenantClient(tenantId);
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'Cliente WhatsApp não disponível para este tenant'
      });
    }
    
    const normalizedPhone = normalizeDDD(phone);
    const chatId = `${normalizedPhone}@c.us`;
    
    await client.sendMessage(chatId, message);
    
    // Log da mensagem enviada
    await supaRaw('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: message,
        type: 'sent',
        sent_at: new Date().toISOString()
      })
    });
    
    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      phone: normalizedPhone
    });
    
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Broadcast para múltiplos números
app.post('/broadcast', async (req, res) => {
  try {
    const { phones, message, tenantId: bodyTenantId } = req.body;
    const tenantId = req.tenantId || bodyTenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID é obrigatório'
      });
    }
    
    if (!phones || !Array.isArray(phones) || !message) {
      return res.status(400).json({
        success: false,
        error: 'Lista de telefones e mensagem são obrigatórios'
      });
    }
    
    const client = await getTenantClient(tenantId);
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'Cliente WhatsApp não disponível para este tenant'
      });
    }
    
    const results = [];
    
    for (const phone of phones) {
      try {
        const normalizedPhone = normalizeDDD(phone);
        const chatId = `${normalizedPhone}@c.us`;
        
        await client.sendMessage(chatId, message);
        
        // Log da mensagem enviada
        await supaRaw('/whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: tenantId,
            phone: normalizedPhone,
            message: message,
            type: 'broadcast',
            sent_at: new Date().toISOString()
          })
        });
        
        results.push({
          phone: normalizedPhone,
          success: true
        });
        
        // Delay entre mensagens para evitar bloqueio
        await delay(1000);
        
      } catch (error) {
        console.error(`❌ Erro ao enviar para ${phone}:`, error);
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
      results
    });
    
  } catch (error) {
    console.error('❌ Erro no broadcast:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Adicionar etiqueta (compatibilidade)
app.post('/add-label', async (req, res) => {
  try {
    const { phone, label, tenantId: bodyTenantId } = req.body;
    const tenantId = req.tenantId || bodyTenantId;
    
    // Para compatibilidade, sempre retorna sucesso
    // A implementação real de etiquetas dependeria da API do WhatsApp Business
    
    res.json({
      success: true,
      message: 'Etiqueta processada',
      phone: phone,
      label: label,
      tenantId: tenantId
    });
    
  } catch (error) {
    console.error('❌ Erro ao processar etiqueta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reinicializar cliente de um tenant
app.post('/restart/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    // Desconectar cliente existente
    const existingClient = tenantClients.get(tenantId);
    if (existingClient) {
      try {
        await existingClient.destroy();
      } catch (error) {
        console.warn(`⚠️ Erro ao destruir cliente existente: ${error.message}`);
      }
    }
    
    // Carregar dados do tenant
    const tenants = await supaRaw(`/tenants?select=*&id=eq.${tenantId}&is_active=eq.true&limit=1`);
    const tenant = tenants[0];
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant não encontrado ou inativo'
      });
    }
    
    // Verificar integração WhatsApp
    const integration = await getWhatsAppIntegration(tenantId);
    if (!integration) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma integração WhatsApp ativa para este tenant'
      });
    }
    
    // Criar novo cliente
    await createTenantClient(tenant);
    
    res.json({
      success: true,
      message: `Cliente WhatsApp reinicializado para ${tenant.name}`,
      tenantId: tenantId
    });
    
  } catch (error) {
    console.error('❌ Erro ao reinicializar cliente:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* ============================ SERVER START ============================ */
async function startServer() {
  try {
    console.log('🚀 Iniciando servidor WhatsApp Multi-Tenant...');
    
    // Inicializar tenants
    await initializeTenants();
    
    // Iniciar servidor HTTP
    app.listen(PORT, () => {
      console.log(`🌐 Servidor rodando na porta ${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  
  for (const [tenantId, client] of tenantClients) {
    try {
      console.log(`🔌 Desconectando cliente ${tenantId}...`);
      await client.destroy();
    } catch (error) {
      console.warn(`⚠️ Erro ao desconectar cliente ${tenantId}:`, error.message);
    }
  }
  
  process.exit(0);
});

// Start the server
startServer();