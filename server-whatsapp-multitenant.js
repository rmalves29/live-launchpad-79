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

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

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

/* ============================ PAYMENT TEMPLATE ============================ */
async function getPaymentTemplate(tenantId) {
  try {
    console.log(`📋 [${tenantId}] Buscando template PAID_ORDER...`);
    
    const templates = await supaRaw(`/whatsapp_templates?select=content&tenant_id=eq.${tenantId}&type=eq.PAID_ORDER&limit=1`);
    
    if (templates && templates.length > 0) {
      console.log(`✅ [${tenantId}] Template personalizado encontrado`);
      return templates[0].content;
    }
    
    console.log(`⚠️ [${tenantId}] Nenhum template encontrado, usando padrão`);
    return `🎉 *Pagamento Confirmado!*

Olá {customer_name}!

✅ Seu pagamento foi confirmado com sucesso!
📄 Pedido: #{order_id}
💰 Valor: {total_amount}
📅 Data: {created_at}

Seu pedido já está sendo preparado! 📦

Obrigado pela preferência! 😊`;
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro ao buscar template:`, error.message);
    return null;
  }
}

function replaceTemplateVariables(template, order) {
  if (!template || !order) return null;
  
  const customerName = order.customer_name || order.customer_phone || 'Cliente';
  const formattedDate = order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  
  return template
    .replace(/{customer_name}/g, customerName)
    .replace(/{order_id}/g, order.id)
    .replace(/{total_amount}/g, formatCurrency(order.total_amount))
    .replace(/{created_at}/g, formattedDate);
}

/* ============================ PAYMENT CONFIRMATION ============================ */
async function checkAndSendPendingPaymentConfirmations(tenantId, client) {
  try {
    console.log(`💰 [${tenantId}] Verificando pedidos pagos sem confirmação...`);
    
    // Buscar template primeiro
    const template = await getPaymentTemplate(tenantId);
    if (!template) {
      console.error(`❌ [${tenantId}] Template não disponível, abortando envio`);
      return;
    }
    
    // Buscar pedidos pagos que não tiveram confirmação enviada
    const orders = await supaRaw(
      `/orders?select=id,customer_phone,customer_name,total_amount,created_at&tenant_id=eq.${tenantId}&is_paid=eq.true&payment_confirmation_sent=is.null&order=created_at.desc`
    );
    
    if (!orders || orders.length === 0) {
      console.log(`✅ [${tenantId}] Nenhum pedido pendente de confirmação`);
      return;
    }
    
    console.log(`📨 [${tenantId}] Encontrados ${orders.length} pedidos para enviar confirmação`);
    
    for (const order of orders) {
      try {
        console.log(`📤 [${tenantId}] Enviando confirmação para pedido #${order.id}`);
        
        // Substituir variáveis no template
        const message = replaceTemplateVariables(template, order);
        
        if (!message) {
          console.error(`❌ [${tenantId}] Erro ao processar template para pedido #${order.id}`);
          continue;
        }

        const normalizedPhone = normalizeDDD(order.customer_phone);
        const chatId = `${normalizedPhone}@c.us`;
        
        // Enviar mensagem
        await client.sendMessage(chatId, message);
        console.log(`✅ [${tenantId}] Mensagem enviada para ${normalizedPhone}`);
        
        // Atualizar order como confirmação enviada
        await supaRaw(`/orders?id=eq.${order.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            payment_confirmation_sent: true
          })
        });
        
        // Registrar no log de mensagens
        await supaRaw('/whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: tenantId,
            phone: normalizedPhone,
            message: message,
            type: 'payment_confirmation',
            order_id: order.id,
            sent_at: new Date().toISOString()
          })
        });
        
        console.log(`💾 [${tenantId}] Pedido #${order.id} marcado como confirmação enviada`);
        
        // Delay entre mensagens
        await delay(2000);
        
      } catch (orderError) {
        console.error(`❌ [${tenantId}] Erro ao processar pedido #${order.id}:`, orderError);
      }
    }
    
    console.log(`✅ [${tenantId}] Verificação de pagamentos concluída`);
    
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro ao verificar pagamentos pendentes:`, error);
  }
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

  client.on('ready', async () => {
    console.log(`✅ Cliente WhatsApp conectado para ${tenant.name}`);
    tenantStatus.set(tenant.id, 'online');
    
    // Verificar e enviar confirmações de pagamento pendentes
    console.log(`🔍 Verificando pagamentos pendentes para ${tenant.name}...`);
    await checkAndSendPendingPaymentConfirmations(tenant.id, client);
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
    const { phone, message, tenantId: bodyTenantId, order_id } = req.body;
    const tenantId = req.tenantId || bodyTenantId;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID é obrigatório'
      });
    }
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Telefone é obrigatório'
      });
    }
    
    const client = await getTenantClient(tenantId);
    
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'Cliente WhatsApp não disponível para este tenant'
      });
    }
    
    let finalMessage = message;
    
    // Se tem order_id, buscar template e dados do pedido
    if (order_id) {
      console.log(`📋 [${tenantId}] Buscando template e dados do pedido #${order_id}`);
      
      try {
        // Buscar template
        const template = await getPaymentTemplate(tenantId);
        if (!template) {
          return res.status(500).json({
            success: false,
            error: 'Template de pagamento não encontrado'
          });
        }

        // Buscar dados do pedido
        const orders = await supaRaw(`/orders?select=id,customer_phone,customer_name,total_amount,created_at&id=eq.${order_id}&tenant_id=eq.${tenantId}&limit=1`);

        if (!orders || orders.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Pedido não encontrado'
          });
        }

        const order = orders[0];
        
        // Montar mensagem com template
        finalMessage = replaceTemplateVariables(template, order);
        
        if (!finalMessage) {
          return res.status(500).json({
            success: false,
            error: 'Erro ao processar template'
          });
        }

        console.log(`✅ [${tenantId}] Template processado para pedido #${order_id}`);
        
      } catch (templateError) {
        console.error(`❌ [${tenantId}] Erro ao processar template:`, templateError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao processar template de pagamento'
        });
      }
    } else if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Mensagem é obrigatória quando não há order_id'
      });
    }
    
    const normalizedPhone = normalizeDDD(phone);
    const chatId = `${normalizedPhone}@c.us`;
    
    console.log(`📤 [${tenantId}] Enviando mensagem para ${normalizedPhone}`);
    await client.sendMessage(chatId, finalMessage);
    console.log(`✅ [${tenantId}] Mensagem enviada com sucesso`);
    
    // Se é uma confirmação de pagamento, atualizar order
    if (order_id) {
      try {
        await supaRaw(`/orders?id=eq.${order_id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            payment_confirmation_sent: true
          })
        });
        console.log(`✅ [${tenantId}] Pedido #${order_id} marcado como confirmação enviada`);
      } catch (updateError) {
        console.error(`❌ [${tenantId}] Erro ao atualizar pedido #${order_id}:`, updateError);
      }
    }
    
    // Log da mensagem enviada
    await supaRaw('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: finalMessage,
        type: order_id ? 'payment_confirmation' : 'sent',
        order_id: order_id || null,
        sent_at: new Date().toISOString()
      })
    });
    
    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      phone: normalizedPhone
    });
    
  } catch (error) {
    console.error(`❌ [${tenantId}] Erro ao enviar mensagem:`, error);
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