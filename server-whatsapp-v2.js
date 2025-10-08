/**
 * server-whatsapp-v2.js — WhatsApp Multi-Tenant Server v2.0
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

// Supabase - USANDO SERVICE ROLE PARA ACESSO COMPLETO
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';

console.log('✅ Usando SERVICE ROLE do Supabase (acesso total ao banco)');

// Multi-tenant storage
const tenantClients = new Map(); // tenantId -> WhatsApp Client
const tenantStatus = new Map();  // tenantId -> status
const tenantAuthDir = new Map(); // tenantId -> auth directory path

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
  
  const client = new Client({
    authStrategy: new LocalAuth({ 
      clientId: `tenant_${tenant.id}`,
      dataPath: authDir
    }),
    puppeteer: {
      headless: false,
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

  // Setup events
  client.on('qr', (qr) => {
    console.log(`📱 QR Code para ${tenant.name}:`);
    qrcode.generate(qr, { small: true });
    tenantStatus.set(tenant.id, 'qr_code');
  });

  client.on('ready', () => {
    console.log(`✅ WhatsApp conectado: ${tenant.name}`);
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
  });

  client.on('message', async (message) => {
    await handleIncomingMessage(tenant.id, message);
  });

  tenantClients.set(tenant.id, client);
  tenantStatus.set(tenant.id, 'initializing');
  
  try {
    await client.initialize();
    console.log(`🚀 Inicializado: ${tenant.name}`);
  } catch (error) {
    console.error(`❌ Erro inicializar ${tenant.name}:`, error);
    tenantStatus.set(tenant.id, 'error');
  }
  
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
  
  for (const tenant of tenants) {
    const integration = await getWhatsAppIntegration(tenant.id);
    
    if (integration) {
      console.log(`🔧 Inicializando: ${tenant.name}`);
      await createTenantClient(tenant);
    } else {
      console.log(`⚠️ Sem integração WhatsApp: ${tenant.name}`);
    }
  }
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
    
    // Desconectar existente
    const existingClient = tenantClients.get(tenantId);
    if (existingClient) {
      try {
        await existingClient.destroy();
      } catch (error) {
        console.warn(`⚠️ Erro destruir cliente: ${error.message}`);
      }
    }
    
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
    await createTenantClient(tenant);
    
    res.json({
      success: true,
      message: `Cliente reinicializado: ${tenant.name}`,
      tenantId: tenantId
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
    
    await initializeTenants();
    
    app.listen(PORT, () => {
      console.log(`🌐 Servidor rodando: http://localhost:${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`💚 Health: http://localhost:${PORT}/health`);
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

startServer();
