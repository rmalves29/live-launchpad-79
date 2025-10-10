const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// ==================== CONFIGURAÇÃO ====================
const PORT = process.env.PORT || 3333;
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Diretório de autenticação
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// ==================== TENANT MANAGER ====================
class TenantManager {
  constructor() {
    this.clients = new Map(); // Map<tenantId, { client, status, qr }>
  }

  async createClient(tenant) {
    const tenantId = tenant.id;
    
    console.log(`📱 Criando cliente WhatsApp para tenant: ${tenant.name} (${tenantId})`);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: tenantId,
        dataPath: AUTH_DIR
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
          '--disable-gpu'
        ]
      }
    });

    // Status inicial
    this.clients.set(tenantId, {
      client,
      status: 'initializing',
      qr: null,
      tenant
    });

    // QR Code
    client.on('qr', (qr) => {
      console.log(`\n🔲 QR Code para ${tenant.name}:`);
      qrcode.generate(qr, { small: true });
      
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.qr = qr;
        clientData.status = 'qr_ready';
      }
    });

    // Autenticado
    client.on('authenticated', () => {
      console.log(`✅ ${tenant.name} autenticado!`);
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.status = 'authenticated';
        clientData.qr = null;
      }
    });

    // Pronto
    client.on('ready', () => {
      console.log(`🚀 ${tenant.name} está pronto!`);
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.status = 'online';
      }
    });

    // Desconectado
    client.on('disconnected', (reason) => {
      console.log(`❌ ${tenant.name} desconectado:`, reason);
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.status = 'offline';
      }
    });

    // Mensagens recebidas - DETECÇÃO AUTOMÁTICA DE CÓDIGOS
    client.on('message', async (msg) => {
      try {
        await this.handleIncomingMessage(tenantId, msg);
      } catch (error) {
        console.error(`❌ Erro ao processar mensagem do tenant ${tenantId}:`, error);
      }
    });

    // Inicializar cliente
    client.initialize();

    return client;
  }

  async handleIncomingMessage(tenantId, msg) {
    const clientData = this.clients.get(tenantId);
    if (!clientData) return;

    const tenant = clientData.tenant;
    const messageText = msg.body || '';
    
    console.log(`📨 Mensagem recebida (${tenant.name}):`, messageText);

    // Detectar códigos de produtos (C seguido de números)
    const productCodeRegex = /C(\d+)/gi;
    const matches = [...messageText.matchAll(productCodeRegex)];
    
    if (matches.length === 0) {
      return; // Não é uma mensagem com código de produto
    }

    const codes = matches.map(match => match[0].toUpperCase());
    console.log(`🔍 Códigos detectados:`, codes);

    // Obter telefone do remetente
    const contact = await msg.getContact();
    const customerPhone = contact.number;
    
    // Verificar se é mensagem de grupo
    const chat = await msg.getChat();
    const isGroup = chat.isGroup;
    const groupName = isGroup ? chat.name : null;

    console.log(`👤 Cliente: ${customerPhone}${isGroup ? ` | Grupo: ${groupName}` : ''}`);

    // Processar cada código detectado via Edge Function
    for (const code of codes) {
      try {
        console.log(`🔄 Processando código ${code}...`);
        
        const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-process-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            customer_phone: customerPhone,
            message: code,
            group_name: groupName
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Erro na edge function para ${code}:`, errorText);
          continue;
        }

        const result = await response.json();
        console.log(`✅ Código ${code} processado:`, result);

      } catch (error) {
        console.error(`❌ Erro ao processar código ${code}:`, error);
      }
    }
  }

  getOnlineClient(tenantId) {
    const clientData = this.clients.get(tenantId);
    if (!clientData || clientData.status !== 'online') {
      return null;
    }
    return clientData.client;
  }

  getAllStatus() {
    const status = {};
    for (const [tenantId, data] of this.clients.entries()) {
      status[tenantId] = {
        tenant_name: data.tenant.name,
        status: data.status,
        qr: data.qr
      };
    }
    return status;
  }

  getTenantStatus(tenantId) {
    const data = this.clients.get(tenantId);
    if (!data) return null;
    
    return {
      tenant_id: tenantId,
      tenant_name: data.tenant.name,
      status: data.status,
      qr: data.qr
    };
  }
}

// ==================== SUPABASE HELPER ====================
class SupabaseHelper {
  constructor(url, serviceKey) {
    this.url = url;
    this.serviceKey = serviceKey;
  }

  async request(pathname, options = {}) {
    const url = `${this.url}${pathname}`;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': this.serviceKey,
      'Authorization': `Bearer ${this.serviceKey}`,
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

  async loadActiveTenants() {
    const data = await this.request('/rest/v1/tenants?is_active=eq.true&select=id,name,slug');
    return data;
  }

  async getWhatsAppIntegration(tenantId) {
    const data = await this.request(
      `/rest/v1/integration_whatsapp?tenant_id=eq.${tenantId}&is_active=eq.true&select=*&limit=1`
    );
    return data[0] || null;
  }

  async getTemplate(tenantId, templateType) {
    const data = await this.request(
      `/rest/v1/whatsapp_templates?tenant_id=eq.${tenantId}&type=eq.${templateType}&select=*&limit=1`
    );
    return data[0] || null;
  }

  async logMessage(tenantId, phone, message, type, metadata = {}) {
    try {
      await this.request('/rest/v1/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          phone,
          message,
          type,
          sent_at: new Date().toISOString(),
          processed: true,
          ...metadata
        })
      });
    } catch (error) {
      console.error('Erro ao logar mensagem:', error);
    }
  }
}

// ==================== UTILIDADES ====================
function normalizePhone(phone) {
  // Remover caracteres especiais
  let clean = phone.replace(/\D/g, '');
  
  // Adicionar DDI 55 se não tiver
  if (!clean.startsWith('55')) {
    clean = '55' + clean;
  }
  
  // Garantir 9º dígito para celulares
  if (clean.length === 12 && clean[4] !== '9') {
    clean = clean.slice(0, 4) + '9' + clean.slice(4);
  }
  
  return clean + '@c.us';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== EXPRESS APP ====================
function createApp(tenantManager, supabaseHelper) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Middleware para extrair tenant_id
  app.use((req, res, next) => {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
    req.tenantId = tenantId;
    next();
  });

  // ==================== ENDPOINTS ====================

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Status de todos os tenants
  app.get('/status', (req, res) => {
    const status = tenantManager.getAllStatus();
    res.json({ 
      success: true, 
      tenants: status,
      timestamp: new Date().toISOString()
    });
  });

  // Status de um tenant específico
  app.get('/status/:tenantId', (req, res) => {
    const { tenantId } = req.params;
    const status = tenantManager.getTenantStatus(tenantId);
    
    if (!status) {
      return res.status(404).json({ 
        success: false, 
        error: 'Tenant não encontrado' 
      });
    }

    res.json({ 
      success: true, 
      ...status 
    });
  });

  // Listar todos os grupos
  app.get('/list-all-groups', async (req, res) => {
    const { tenantId } = req;

    if (!tenantId) {
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id obrigatório' 
      });
    }

    const client = tenantManager.getOnlineClient(tenantId);
    if (!client) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado para este tenant' 
      });
    }

    try {
      const chats = await client.getChats();
      const groups = chats
        .filter(chat => chat.isGroup)
        .map(group => ({
          id: group.id._serialized,
          name: group.name,
          participantCount: group.participants?.length || 0
        }));

      console.log(`📋 ${groups.length} grupos encontrados para tenant ${tenantId}`);

      res.json({ 
        success: true, 
        groups,
        count: groups.length
      });
    } catch (error) {
      console.error('❌ Erro ao listar grupos:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Enviar mensagem para grupo (SendFlow)
  app.post('/send-group', async (req, res) => {
    const { tenantId } = req;
    const { groupId, message } = req.body;

    if (!tenantId) {
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id obrigatório' 
      });
    }

    if (!groupId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'groupId e message são obrigatórios' 
      });
    }

    const client = tenantManager.getOnlineClient(tenantId);
    if (!client) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado' 
      });
    }

    try {
      console.log(`📤 Enviando mensagem para grupo ${groupId}`);
      
      await client.sendMessage(groupId, message);
      
      // Logar no Supabase
      await supabaseHelper.logMessage(
        tenantId,
        groupId,
        message,
        'sendflow',
        { whatsapp_group_name: groupId }
      );

      console.log(`✅ Mensagem enviada para grupo ${groupId}`);

      res.json({ 
        success: true, 
        message: 'Mensagem enviada com sucesso' 
      });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Enviar mensagem individual
  app.post('/send', async (req, res) => {
    const { tenantId } = req;
    const { phone, message } = req.body;

    if (!tenantId) {
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id obrigatório' 
      });
    }

    if (!phone || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'phone e message são obrigatórios' 
      });
    }

    const client = tenantManager.getOnlineClient(tenantId);
    if (!client) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado' 
      });
    }

    try {
      const normalizedPhone = normalizePhone(phone);
      console.log(`📤 Enviando mensagem para ${normalizedPhone}`);
      
      await client.sendMessage(normalizedPhone, message);
      
      // Logar no Supabase
      await supabaseHelper.logMessage(
        tenantId,
        phone,
        message,
        'individual'
      );

      console.log(`✅ Mensagem enviada para ${normalizedPhone}`);

      res.json({ 
        success: true, 
        message: 'Mensagem enviada com sucesso' 
      });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Processar mensagem recebida manualmente (opcional)
  app.post('/process-incoming-message', async (req, res) => {
    const { tenantId } = req;
    const { customer_phone, message, group_name } = req.body;

    if (!tenantId) {
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id obrigatório' 
      });
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-process-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          customer_phone,
          message,
          group_name
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();

      res.json({ 
        success: true, 
        result 
      });
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  return app;
}

// ==================== INICIALIZAÇÃO ====================
async function main() {
  console.log('🚀 Iniciando servidor WhatsApp Multi-Tenant...\n');

  // Verificar variáveis de ambiente
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY não configurada!');
    process.exit(1);
  }

  const supabaseHelper = new SupabaseHelper(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const tenantManager = new TenantManager();

  // Carregar tenants ativos
  console.log('📋 Carregando tenants ativos...');
  const tenants = await supabaseHelper.loadActiveTenants();
  console.log(`✅ ${tenants.length} tenant(s) encontrado(s)\n`);

  // Inicializar clientes WhatsApp para cada tenant
  for (const tenant of tenants) {
    console.log(`🔄 Inicializando ${tenant.name}...`);
    await tenantManager.createClient(tenant);
    await delay(2000); // Delay entre inicializações
  }

  // Criar app Express
  const app = createApp(tenantManager, supabaseHelper);

  // Iniciar servidor
  app.listen(PORT, () => {
    console.log(`\n✅ Servidor rodando na porta ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`\n🔐 Escaneie os QR Codes acima para conectar cada tenant\n`);
  });
}

// Executar
main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
