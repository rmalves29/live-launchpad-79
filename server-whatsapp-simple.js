const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3333;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// Armazenar clientes WhatsApp por tenant
const clients = new Map();
const clientStatus = new Map();

// Normalizar telefone para formato WhatsApp
function normalizePhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  const withoutDDI = cleaned.startsWith('55') ? cleaned.substring(2) : cleaned;
  return `55${withoutDDI}@c.us`;
}

// Fazer requisição para Supabase
async function supabaseQuery(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response.json();
}

// Salvar mensagem no Supabase
async function saveMessage(tenantId, phone, message, type) {
  await supabaseQuery('/rest/v1/whatsapp_messages', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      phone: phone.replace('@c.us', ''),
      message,
      type,
      [type === 'received' ? 'received_at' : 'sent_at']: new Date().toISOString()
    })
  });
}

// Criar cliente WhatsApp para um tenant
async function createClient(tenantId, tenantName) {
  if (clients.has(tenantId)) {
    console.log(`✅ Cliente já existe para tenant: ${tenantName}`);
    return clients.get(tenantId);
  }

  console.log(`🚀 Criando cliente WhatsApp para tenant: ${tenantName} (${tenantId})`);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: tenantId,
      dataPath: `.wwebjs_auth_tenants/${tenantId}`
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

  // QR Code
  client.on('qr', (qr) => {
    console.log(`📱 QR Code gerado para ${tenantName}`);
    qrcode.generate(qr, { small: true });
    clientStatus.set(tenantId, {
      status: 'qr_generated',
      qr,
      tenantName
    });
  });

  // Autenticação
  client.on('authenticated', () => {
    console.log(`✅ Autenticado: ${tenantName}`);
    clientStatus.set(tenantId, {
      status: 'authenticated',
      tenantName
    });
  });

  // Pronto
  client.on('ready', () => {
    console.log(`🟢 WhatsApp pronto: ${tenantName}`);
    clientStatus.set(tenantId, {
      status: 'ready',
      tenantName,
      connectedAt: new Date().toISOString()
    });
  });

  // Desconectado
  client.on('disconnected', (reason) => {
    console.log(`🔴 Desconectado: ${tenantName} - ${reason}`);
    clientStatus.set(tenantId, {
      status: 'disconnected',
      tenantName,
      reason
    });
  });

  // Mensagens recebidas
  client.on('message', async (msg) => {
    try {
      const chat = await msg.getChat();
      const phone = msg.from.replace('@c.us', '').replace('@g.us', '');
      const isGroup = msg.from.includes('@g.us');
      
      console.log(`📨 Mensagem de ${phone} (Grupo: ${isGroup}): ${msg.body}`);

      // Salvar mensagem
      await saveMessage(tenantId, msg.from, msg.body, 'received');

      // Detectar código de produto
      const match = msg.body.trim().toUpperCase().match(/^(?:[CPA]\s*)?(\d{1,6})$/);
      if (match) {
        const numeric = match[1];
        const candidates = [`C${numeric}`, `P${numeric}`, `A${numeric}`, numeric];
        
        // Buscar produto
        const products = await supabaseQuery(
          `/rest/v1/products?tenant_id=eq.${tenantId}&code=in.(${candidates.join(',')})&is_active=eq.true&limit=1`
        );

        if (products && products.length > 0) {
          const product = products[0];
          console.log(`🛒 Produto encontrado: ${product.code} - ${product.name}`);
          
          // Enviar confirmação
          const confirmMsg = `✅ *${product.name}* (${product.code})\n💰 R$ ${parseFloat(product.price).toFixed(2)}\n\n✓ Adicionado ao carrinho!`;
          await client.sendMessage(msg.from, confirmMsg);
          await saveMessage(tenantId, msg.from, confirmMsg, 'sent');
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
    }
  });

  await client.initialize();
  clients.set(tenantId, client);
  
  return client;
}

// Obter cliente de um tenant
function getClient(tenantId) {
  const client = clients.get(tenantId);
  if (!client) {
    throw new Error(`Cliente não encontrado para tenant: ${tenantId}`);
  }
  
  const status = clientStatus.get(tenantId);
  if (!status || status.status !== 'ready') {
    throw new Error(`WhatsApp não está pronto. Status: ${status?.status || 'desconhecido'}`);
  }
  
  return client;
}

// ===== ROTAS API =====

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Status geral
app.get('/status', (req, res) => {
  const statuses = Array.from(clientStatus.entries()).map(([tenantId, status]) => ({
    tenantId,
    ...status
  }));
  
  res.json({
    totalClients: clients.size,
    clients: statuses
  });
});

// Status de um tenant específico
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const status = clientStatus.get(tenantId);
  
  if (!status) {
    return res.status(404).json({ error: 'Tenant não encontrado' });
  }
  
  res.json({
    tenantId,
    hasClient: clients.has(tenantId),
    ...status
  });
});

// Inicializar cliente
app.post('/init/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { tenantName } = req.body;
    
    await createClient(tenantId, tenantName || tenantId);
    
    res.json({ success: true, message: 'Cliente inicializado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enviar mensagem individual
app.post('/send', async (req, res) => {
  try {
    const { tenantId, phone, message } = req.body;
    
    if (!tenantId || !phone || !message) {
      return res.status(400).json({ error: 'Campos obrigatórios: tenantId, phone, message' });
    }
    
    const client = getClient(tenantId);
    const normalizedPhone = normalizePhone(phone);
    
    await client.sendMessage(normalizedPhone, message);
    await saveMessage(tenantId, normalizedPhone, message, 'sent');
    
    console.log(`✅ Mensagem enviada para ${phone} (${tenantId})`);
    
    res.json({ success: true, phone: normalizedPhone });
  } catch (error) {
    console.error('❌ Erro ao enviar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enviar mensagem em massa
app.post('/broadcast', async (req, res) => {
  try {
    const { tenantId, phones, message, delay = 2000 } = req.body;
    
    if (!tenantId || !phones || !Array.isArray(phones) || !message) {
      return res.status(400).json({ error: 'Campos obrigatórios: tenantId, phones (array), message' });
    }
    
    const client = getClient(tenantId);
    const results = [];
    
    for (const phone of phones) {
      try {
        const normalizedPhone = normalizePhone(phone);
        await client.sendMessage(normalizedPhone, message);
        await saveMessage(tenantId, normalizedPhone, message, 'sent');
        
        results.push({ phone, success: true });
        console.log(`✅ Enviado para ${phone}`);
        
        // Delay entre mensagens
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        results.push({ phone, success: false, error: error.message });
        console.error(`❌ Erro para ${phone}:`, error.message);
      }
    }
    
    const successful = results.filter(r => r.success).length;
    console.log(`📊 Broadcast completo: ${successful}/${phones.length}`);
    
    res.json({
      success: true,
      total: phones.length,
      successful,
      failed: phones.length - successful,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== INICIALIZAÇÃO =====

async function start() {
  try {
    // Buscar tenants ativos
    const tenants = await supabaseQuery('/rest/v1/tenants?is_active=eq.true&select=id,name,slug');
    
    // Validar se tenants é um array
    if (!Array.isArray(tenants)) {
      console.error('❌ Erro: resposta de tenants não é um array:', tenants);
      console.log('⚠️  Continuando sem inicializar clientes automaticamente');
      
      app.listen(PORT, () => {
        console.log(`\n🚀 Servidor WhatsApp rodando na porta ${PORT}`);
        console.log(`📊 Status: http://localhost:${PORT}/status`);
        console.log(`🏥 Health: http://localhost:${PORT}/health`);
        console.log(`\n💡 Use POST /init/:tenantId para inicializar manualmente\n`);
      });
      return;
    }
    
    console.log(`🏢 ${tenants.length} tenants ativos encontrados`);
    
    // Buscar integrações WhatsApp ativas
    for (const tenant of tenants) {
      const integrations = await supabaseQuery(
        `/rest/v1/integration_whatsapp?tenant_id=eq.${tenant.id}&is_active=eq.true&select=*`
      );
      
      if (integrations && integrations.length > 0) {
        console.log(`📱 Inicializando WhatsApp para: ${tenant.name}`);
        await createClient(tenant.id, tenant.name);
      }
    }
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Servidor WhatsApp rodando na porta ${PORT}`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
      console.log(`🏥 Health: http://localhost:${PORT}/health\n`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Desligando servidor...');
  
  for (const [tenantId, client] of clients.entries()) {
    try {
      await client.destroy();
      console.log(`✅ Cliente desconectado: ${tenantId}`);
    } catch (error) {
      console.error(`❌ Erro ao desconectar ${tenantId}:`, error);
    }
  }
  
  process.exit(0);
});

start();
