/**
 * WhatsApp Server v3 - Multi-Tenant
 * Servidor Node.js otimizado para gerenciar múltiplas instâncias WhatsApp
 * Integrado com Supabase para gestão de tenants
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');

// ========================================
// CONFIGURAÇÃO
// ========================================
const PORT = process.env.PORT || 3333;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ ERRO: SUPABASE_SERVICE_KEY não configurada');
  console.log('Configure com: export SUPABASE_SERVICE_KEY=sua_chave_aqui');
  process.exit(1);
}

// ========================================
// GERENCIAMENTO DE CLIENTES POR TENANT
// ========================================
const tenantClients = new Map(); // tenant_id -> Client
const tenantStatus = new Map(); // tenant_id -> status
const tenantAuthDir = '.wwebjs_auth_v3';

// ========================================
// UTILIDADES
// ========================================

/**
 * Normaliza telefone para armazenamento (remove DDI, ajusta 9º dígito)
 */
function normalizeForStorage(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('55')) cleaned = cleaned.substring(2);
  if (cleaned.length === 11 && cleaned[2] === '9') {
    cleaned = cleaned.substring(0, 2) + cleaned.substring(3);
  }
  return cleaned;
}

/**
 * Normaliza telefone para envio WhatsApp (adiciona DDI 55, ajusta 9º dígito)
 */
function normalizeForSending(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('55')) cleaned = cleaned.substring(2);
  
  const ddd = cleaned.substring(0, 2);
  const resto = cleaned.substring(2);
  
  // DDDs que usam 9º dígito
  const dddsCom9 = ['11','12','13','14','15','16','17','18','19','21','22','24','27','28'];
  
  if (dddsCom9.includes(ddd) && resto.length === 8) {
    cleaned = ddd + '9' + resto;
  }
  
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned + '@c.us';
}

/**
 * Formata valor em Real
 */
function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

/**
 * Delay em milissegundos
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// INTEGRAÇÃO SUPABASE
// ========================================

/**
 * Faz requisição ao Supabase REST API
 */
async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Busca template de mensagem
 */
async function getTemplate(tenantId, type) {
  try {
    const data = await supabaseRequest(
      `/whatsapp_templates?tenant_id=eq.${tenantId}&type=eq.${type}&select=content`,
      { headers: { 'Accept': 'application/vnd.pgrst.object+json' } }
    );
    return data?.content || null;
  } catch (error) {
    console.error(`Erro ao buscar template ${type}:`, error);
    return null;
  }
}

/**
 * Salva mensagem no banco
 */
async function saveMessage(tenantId, phone, message, type, metadata = {}) {
  try {
    await supabaseRequest('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        phone: normalizeForStorage(phone),
        message,
        type,
        sent_at: new Date().toISOString(),
        ...metadata
      })
    });
  } catch (error) {
    console.error('Erro ao salvar mensagem:', error);
  }
}

/**
 * Envia webhook para Edge Function
 */
async function sendWebhook(tenantId, payload) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/webhook-whatsapp/${tenantId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Erro ao enviar webhook:', await response.text());
    }
  } catch (error) {
    console.error('Erro ao enviar webhook:', error);
  }
}

/**
 * Busca tenants ativos
 */
async function getActiveTenants() {
  try {
    const tenants = await supabaseRequest('/tenants?is_active=eq.true&select=id,name,slug');
    return tenants;
  } catch (error) {
    console.error('Erro ao buscar tenants:', error);
    return [];
  }
}

/**
 * Busca integração WhatsApp do tenant
 */
async function getWhatsAppIntegration(tenantId) {
  try {
    const data = await supabaseRequest(
      `/integration_whatsapp?tenant_id=eq.${tenantId}&is_active=eq.true&select=*`,
      { headers: { 'Accept': 'application/vnd.pgrst.object+json' } }
    );
    return data;
  } catch (error) {
    console.error(`Erro ao buscar integração WhatsApp do tenant ${tenantId}:`, error);
    return null;
  }
}

// ========================================
// CRIAÇÃO E GERENCIAMENTO DE CLIENTES
// ========================================

/**
 * Cria cliente WhatsApp para um tenant
 */
function createTenantClient(tenant) {
  const clientId = `tenant_${tenant.id}`;
  
  console.log(`\n🔧 Criando cliente para tenant: ${tenant.name} (${tenant.slug})`);
  
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: clientId,
      dataPath: tenantAuthDir
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
        '--disable-gpu'
      ]
    }
  });

  // Evento: QR Code
  client.on('qr', (qr) => {
    console.log(`\n📱 QR CODE para ${tenant.name}:`);
    qrcode.generate(qr, { small: true });
    tenantStatus.set(tenant.id, {
      status: 'qr_code',
      message: 'Aguardando leitura do QR Code',
      timestamp: new Date().toISOString()
    });
  });

  // Evento: Autenticado
  client.on('authenticated', () => {
    console.log(`✅ ${tenant.name}: Autenticado com sucesso`);
    tenantStatus.set(tenant.id, {
      status: 'authenticated',
      message: 'Autenticado',
      timestamp: new Date().toISOString()
    });
  });

  // Evento: Pronto
  client.on('ready', async () => {
    const info = client.info;
    console.log(`✅ ${tenant.name}: Cliente conectado - ${info.pushname}`);
    tenantStatus.set(tenant.id, {
      status: 'connected',
      message: 'Conectado e pronto',
      phone: info.wid.user,
      pushname: info.pushname,
      timestamp: new Date().toISOString()
    });
  });

  // Evento: Falha de autenticação
  client.on('auth_failure', (msg) => {
    console.error(`❌ ${tenant.name}: Falha na autenticação -`, msg);
    tenantStatus.set(tenant.id, {
      status: 'auth_failure',
      message: 'Falha na autenticação',
      error: msg,
      timestamp: new Date().toISOString()
    });
  });

  // Evento: Desconectado
  client.on('disconnected', (reason) => {
    console.log(`⚠️ ${tenant.name}: Desconectado -`, reason);
    tenantStatus.set(tenant.id, {
      status: 'disconnected',
      message: 'Desconectado',
      reason,
      timestamp: new Date().toISOString()
    });
  });

  // Evento: Mensagem recebida
  client.on('message', async (message) => {
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      const payload = {
        phone: contact.number,
        message: message.body,
        isGroup: chat.isGroup,
        groupName: chat.isGroup ? chat.name : null,
        timestamp: message.timestamp,
        from: message.from,
        to: message.to,
        hasMedia: message.hasMedia
      };

      console.log(`📥 ${tenant.name}: Mensagem de ${contact.number}`);

      // Envia para webhook
      await sendWebhook(tenant.id, payload);

      // Salva no banco
      await saveMessage(
        tenant.id,
        contact.number,
        message.body,
        chat.isGroup ? 'group_received' : 'received',
        {
          whatsapp_group_name: chat.isGroup ? chat.name : null,
          received_at: new Date().toISOString()
        }
      );

    } catch (error) {
      console.error(`Erro ao processar mensagem:`, error);
    }
  });

  // Inicializar cliente
  client.initialize();
  tenantClients.set(tenant.id, client);
  
  return client;
}

/**
 * Obtém cliente ativo de um tenant
 */
function getTenantClient(tenantId) {
  const client = tenantClients.get(tenantId);
  if (!client) {
    throw new Error(`Cliente não encontrado para tenant ${tenantId}`);
  }
  
  const status = tenantStatus.get(tenantId);
  if (!status || status.status !== 'connected') {
    throw new Error(`Cliente não está conectado. Status: ${status?.status || 'desconhecido'}`);
  }
  
  return client;
}

/**
 * Inicializa todos os tenants ativos
 */
async function initializeTenants() {
  console.log('🚀 Inicializando tenants...\n');
  
  const tenants = await getActiveTenants();
  console.log(`📋 Encontrados ${tenants.length} tenants ativos`);

  for (const tenant of tenants) {
    const integration = await getWhatsAppIntegration(tenant.id);
    
    if (integration) {
      console.log(`✅ Tenant ${tenant.name} tem integração WhatsApp ativa`);
      createTenantClient(tenant);
      await delay(2000); // Delay entre inicializações
    } else {
      console.log(`⚠️ Tenant ${tenant.name} não tem integração WhatsApp ativa`);
    }
  }
}

// ========================================
// API EXPRESS
// ========================================

const app = express();
app.use(express.json());
app.use(cors());

/**
 * GET /status - Status geral do servidor
 */
app.get('/status', (req, res) => {
  const statuses = {};
  
  for (const [tenantId, status] of tenantStatus.entries()) {
    statuses[tenantId] = status;
  }

  res.json({
    server: 'WhatsApp Server v3 - Multi-Tenant',
    uptime: process.uptime(),
    tenants: tenantClients.size,
    statuses
  });
});

/**
 * GET /status/:tenantId - Status de um tenant específico
 */
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const status = tenantStatus.get(tenantId);

  if (!status) {
    return res.status(404).json({ error: 'Tenant não encontrado' });
  }

  res.json(status);
});

/**
 * POST /send - Enviar mensagem simples
 */
app.post('/send', async (req, res) => {
  try {
    const { phone, message, tenantId } = req.body;

    if (!phone || !message || !tenantId) {
      return res.status(400).json({
        error: 'Campos obrigatórios: phone, message, tenantId'
      });
    }

    const client = getTenantClient(tenantId);
    const normalizedPhone = normalizeForSending(phone);

    await client.sendMessage(normalizedPhone, message);
    await saveMessage(tenantId, phone, message, 'sent');

    console.log(`📤 Mensagem enviada para ${phone} (tenant: ${tenantId})`);

    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      phone: normalizedPhone
    });

  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /broadcast - Enviar mensagem para múltiplos contatos
 */
app.post('/broadcast', async (req, res) => {
  try {
    const { phones, message, tenantId, delayMs = 2000 } = req.body;

    if (!phones || !Array.isArray(phones) || !message || !tenantId) {
      return res.status(400).json({
        error: 'Campos obrigatórios: phones (array), message, tenantId'
      });
    }

    const client = getTenantClient(tenantId);
    const results = [];

    for (const phone of phones) {
      try {
        const normalizedPhone = normalizeForSending(phone);
        await client.sendMessage(normalizedPhone, message);
        await saveMessage(tenantId, phone, message, 'broadcast');
        
        results.push({ phone, success: true });
        console.log(`📤 Broadcast enviado para ${phone}`);
        
        // Delay entre envios
        if (phones.indexOf(phone) < phones.length - 1) {
          await delay(delayMs);
        }
      } catch (error) {
        results.push({ phone, success: false, error: error.message });
        console.error(`❌ Erro ao enviar para ${phone}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: `Broadcast concluído`,
      total: phones.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });

  } catch (error) {
    console.error('Erro no broadcast:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /add-label - Adicionar etiqueta a um contato
 */
app.post('/add-label', async (req, res) => {
  try {
    const { phone, label, tenantId } = req.body;

    if (!phone || !label || !tenantId) {
      return res.status(400).json({
        error: 'Campos obrigatórios: phone, label, tenantId'
      });
    }

    const client = getTenantClient(tenantId);
    const normalizedPhone = normalizeForSending(phone);

    // Buscar ou criar label
    const labels = await client.getLabels();
    let labelObj = labels.find(l => l.name === label);

    if (!labelObj) {
      labelObj = await client.createLabel(label, { hexColor: '#10B981' });
    }

    // Buscar chat
    const chat = await client.getChatById(normalizedPhone);
    
    // Adicionar label ao chat
    await chat.addLabel(labelObj.id);

    console.log(`🏷️ Label "${label}" adicionada para ${phone} (tenant: ${tenantId})`);

    res.json({
      success: true,
      message: 'Label adicionada com sucesso',
      phone: normalizedPhone,
      label
    });

  } catch (error) {
    console.error('Erro ao adicionar label:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /send-template - Enviar mensagem com template
 */
app.post('/send-template', async (req, res) => {
  try {
    const { phone, templateType, variables = {}, tenantId } = req.body;

    if (!phone || !templateType || !tenantId) {
      return res.status(400).json({
        error: 'Campos obrigatórios: phone, templateType, tenantId'
      });
    }

    const client = getTenantClient(tenantId);
    
    // Buscar template
    let template = await getTemplate(tenantId, templateType);
    
    if (!template) {
      return res.status(404).json({
        error: `Template ${templateType} não encontrado`
      });
    }

    // Substituir variáveis
    for (const [key, value] of Object.entries(variables)) {
      template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    const normalizedPhone = normalizeForSending(phone);
    await client.sendMessage(normalizedPhone, template);
    await saveMessage(tenantId, phone, template, templateType);

    console.log(`📤 Template ${templateType} enviado para ${phone} (tenant: ${tenantId})`);

    res.json({
      success: true,
      message: 'Template enviado com sucesso',
      phone: normalizedPhone,
      template: templateType
    });

  } catch (error) {
    console.error('Erro ao enviar template:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /restart/:tenantId - Reiniciar cliente de um tenant
 */
app.post('/restart/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const client = tenantClients.get(tenantId);
    if (client) {
      await client.destroy();
      tenantClients.delete(tenantId);
      tenantStatus.delete(tenantId);
    }

    const tenants = await getActiveTenants();
    const tenant = tenants.find(t => t.id === tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    createTenantClient(tenant);

    res.json({
      success: true,
      message: `Cliente do tenant ${tenant.name} reiniciado`
    });

  } catch (error) {
    console.error('Erro ao reiniciar cliente:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /health - Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========================================
// INICIALIZAÇÃO DO SERVIDOR
// ========================================

async function startServer() {
  try {
    // Inicializar tenants
    await initializeTenants();

    // Iniciar servidor Express
    app.listen(PORT, () => {
      console.log(`\n✅ Servidor WhatsApp v3 rodando na porta ${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`🏥 Health: http://localhost:${PORT}/health\n`);
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Tratamento de encerramento gracioso
process.on('SIGINT', async () => {
  console.log('\n⚠️ Encerrando servidor...');
  
  for (const [tenantId, client] of tenantClients) {
    console.log(`Desconectando tenant ${tenantId}...`);
    await client.destroy();
  }
  
  console.log('✅ Servidor encerrado');
  process.exit(0);
});

// Iniciar
startServer();
