/**
 * WhatsApp Server - Versão Simplificada
 * Servidor Node.js para gerenciar WhatsApp Multi-Tenant
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
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';

console.log('🚀 Iniciando WhatsApp Server...');
console.log(`📊 Porta: ${PORT}`);
console.log(`🔑 Service Key: ${SUPABASE_SERVICE_KEY.substring(0, 20)}...`);

// ========================================
// ARMAZENAMENTO DE CLIENTES
// ========================================
const clients = new Map(); // tenantId -> client
const clientStatus = new Map(); // tenantId -> {status, info}

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

function normalizePhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se tiver
  if (cleaned.startsWith('55')) {
    cleaned = cleaned.substring(2);
  }
  
  // Adiciona 9º dígito se necessário
  const ddd = cleaned.substring(0, 2);
  const numero = cleaned.substring(2);
  const dddsCom9 = ['11','12','13','14','15','16','17','18','19','21','22','24','27','28'];
  
  if (dddsCom9.includes(ddd) && numero.length === 8) {
    cleaned = ddd + '9' + numero;
  }
  
  // Adiciona DDI e sufixo WhatsApp
  return '55' + cleaned + '@c.us';
}

async function supabaseQuery(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status}`);
  }
  
  return response.json();
}

async function saveMessage(tenantId, phone, message, type) {
  try {
    await supabaseQuery('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        phone: phone.replace(/\D/g, '').replace(/^55/, ''),
        message,
        type,
        sent_at: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error('❌ Erro ao salvar mensagem:', error.message);
  }
}

// ========================================
// GERENCIAMENTO DE CLIENTES WHATSAPP
// ========================================

function createClient(tenantId, tenantName) {
  console.log(`\n🔧 Criando cliente para: ${tenantName}`);
  
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `tenant_${tenantId}`,
      dataPath: '.wwebjs_auth'
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    }
  });

  // QR Code
  client.on('qr', (qr) => {
    console.log(`\n📱 QR CODE - ${tenantName}:`);
    qrcode.generate(qr, { small: true });
    clientStatus.set(tenantId, { 
      status: 'qr_code', 
      message: 'Aguardando leitura do QR Code',
      timestamp: new Date().toISOString()
    });
  });

  // Autenticado
  client.on('authenticated', () => {
    console.log(`✅ ${tenantName}: Autenticado`);
    clientStatus.set(tenantId, { 
      status: 'authenticated', 
      message: 'Autenticado com sucesso',
      timestamp: new Date().toISOString()
    });
  });

  // Pronto
  client.on('ready', () => {
    const info = client.info;
    console.log(`✅ ${tenantName}: Conectado - ${info.pushname} (${info.wid.user})`);
    clientStatus.set(tenantId, { 
      status: 'connected', 
      message: 'Conectado e pronto',
      phone: info.wid.user,
      pushname: info.pushname,
      timestamp: new Date().toISOString()
    });
  });

  // Falha
  client.on('auth_failure', (msg) => {
    console.error(`❌ ${tenantName}: Falha na autenticação`);
    clientStatus.set(tenantId, { 
      status: 'error', 
      message: 'Falha na autenticação',
      error: msg,
      timestamp: new Date().toISOString()
    });
  });

  // Desconectado
  client.on('disconnected', (reason) => {
    console.log(`⚠️ ${tenantName}: Desconectado - ${reason}`);
    clientStatus.set(tenantId, { 
      status: 'disconnected', 
      message: 'Desconectado',
      reason,
      timestamp: new Date().toISOString()
    });
  });

  // Mensagem recebida
  client.on('message', async (msg) => {
    try {
      const contact = await msg.getContact();
      console.log(`📥 ${tenantName}: Mensagem de ${contact.number}`);
      
      await saveMessage(tenantId, contact.number, msg.body, 'received');
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error.message);
    }
  });

  client.initialize();
  clients.set(tenantId, client);
  
  return client;
}

function getClient(tenantId) {
  const client = clients.get(tenantId);
  if (!client) {
    throw new Error('Cliente não encontrado');
  }
  
  const status = clientStatus.get(tenantId);
  if (!status || status.status !== 'connected') {
    throw new Error(`Cliente não conectado. Status: ${status?.status || 'desconhecido'}`);
  }
  
  return client;
}

// ========================================
// API REST
// ========================================

const app = express();
app.use(express.json());
app.use(cors());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    clients: clients.size 
  });
});

// Status geral
app.get('/status', (req, res) => {
  const statuses = {};
  for (const [tenantId, status] of clientStatus.entries()) {
    statuses[tenantId] = status;
  }
  
  res.json({
    server: 'WhatsApp Server - Simplificado',
    version: '1.0.0',
    uptime: process.uptime(),
    totalClients: clients.size,
    clients: statuses
  });
});

// Status de um tenant
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const status = clientStatus.get(tenantId);
  
  if (!status) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  
  res.json(status);
});

// Inicializar cliente para um tenant
app.post('/init/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { tenantName } = req.body;
    
    if (clients.has(tenantId)) {
      return res.json({ 
        message: 'Cliente já existe',
        status: clientStatus.get(tenantId)
      });
    }
    
    createClient(tenantId, tenantName || tenantId);
    
    res.json({ 
      success: true,
      message: 'Cliente iniciado com sucesso',
      tenantId
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar cliente:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enviar mensagem
app.post('/send', async (req, res) => {
  try {
    const { tenantId, phone, message } = req.body;
    
    if (!tenantId || !phone || !message) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: tenantId, phone, message' 
      });
    }
    
    const client = getClient(tenantId);
    const normalizedPhone = normalizePhone(phone);
    
    await client.sendMessage(normalizedPhone, message);
    await saveMessage(tenantId, phone, message, 'sent');
    
    console.log(`📤 Mensagem enviada: ${phone} (tenant: ${tenantId})`);
    
    res.json({ 
      success: true,
      message: 'Mensagem enviada com sucesso',
      phone: normalizedPhone
    });
    
  } catch (error) {
    console.error('❌ Erro ao enviar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Broadcast (enviar para múltiplos)
app.post('/broadcast', async (req, res) => {
  try {
    const { tenantId, phones, message, delayMs = 2000 } = req.body;
    
    if (!tenantId || !phones || !Array.isArray(phones) || !message) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: tenantId, phones (array), message' 
      });
    }
    
    const client = getClient(tenantId);
    const results = [];
    
    for (const phone of phones) {
      try {
        const normalizedPhone = normalizePhone(phone);
        await client.sendMessage(normalizedPhone, message);
        await saveMessage(tenantId, phone, message, 'broadcast');
        
        results.push({ phone, success: true });
        console.log(`📤 Broadcast: ${phone}`);
        
        // Delay entre envios
        if (phones.indexOf(phone) < phones.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        results.push({ phone, success: false, error: error.message });
        console.error(`❌ Erro broadcast ${phone}:`, error.message);
      }
    }
    
    res.json({
      success: true,
      total: phones.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
    
  } catch (error) {
    console.error('❌ Erro no broadcast:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// INICIALIZAÇÃO
// ========================================

async function start() {
  try {
    // Buscar tenants ativos
    console.log('\n📋 Buscando tenants ativos...');
    const tenants = await supabaseQuery('/tenants?is_active=eq.true&select=id,name,slug');
    console.log(`✅ Encontrados ${tenants.length} tenants`);
    
    // Iniciar clientes para cada tenant
    for (const tenant of tenants) {
      const integration = await supabaseQuery(
        `/integration_whatsapp?tenant_id=eq.${tenant.id}&is_active=eq.true&select=*`,
        { headers: { 'Accept': 'application/vnd.pgrst.object+json' } }
      ).catch(() => null);
      
      if (integration) {
        console.log(`✅ Iniciando: ${tenant.name}`);
        createClient(tenant.id, tenant.name);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`⚠️ Sem integração WhatsApp: ${tenant.name}`);
      }
    }
    
    // Iniciar servidor Express
    app.listen(PORT, () => {
      console.log(`\n✅ Servidor rodando na porta ${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`💚 Health: http://localhost:${PORT}/health\n`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️ Encerrando servidor...');
  
  for (const [tenantId, client] of clients.entries()) {
    console.log(`🔌 Desconectando tenant: ${tenantId}`);
    await client.destroy();
  }
  
  console.log('✅ Servidor encerrado');
  process.exit(0);
});

// Iniciar
start();
