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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';

// Diretório de autenticação
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');

// Função para limpar lockfiles antigos
function cleanupLockfiles(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath, { recursive: true });
      files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (file.includes('lockfile') || file.includes('.lock')) {
          try {
            fs.unlinkSync(fullPath);
            console.log(`🧹 Lockfile removido: ${fullPath}`);
          } catch (err) {
            // Ignorar erros ao deletar lockfiles
          }
        }
      });
    }
  } catch (error) {
    console.log('⚠️ Aviso ao limpar lockfiles:', error.message);
  }
}

// Criar diretório se não existir
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
    
    // Evitar inicialização duplicada
    if (this.clients.has(tenantId)) {
      console.log(`⚠️ Cliente já existe para ${tenant.name}, pulando...`);
      return this.clients.get(tenantId).client;
    }
    
    console.log(`📱 Criando cliente WhatsApp para tenant: ${tenant.name} (${tenantId})`);

    // Configuração do Puppeteer com detecção de Chrome
    const puppeteerConfig = {
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
    };

    // Tentar usar Chrome do sistema no Windows se Chromium não estiver disponível
    if (process.platform === 'win32') {
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
      ];

      for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
          console.log(`✅ Chrome encontrado: ${chromePath}`);
          puppeteerConfig.executablePath = chromePath;
          break;
        }
      }
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: tenantId,
        dataPath: AUTH_DIR
      }),
      puppeteer: puppeteerConfig
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

    // Desconectado - NÃO destruir, deixar tentar reconectar
    client.on('disconnected', (reason) => {
      console.log(`⚠️ ${tenant.name} desconectado:`, reason);
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.status = 'disconnected';
        clientData.qr = null;
      }
      // NÃO destruir - deixar o WhatsApp Web tentar reconectar automaticamente
      console.log(`🔄 ${tenant.name} tentará reconectar automaticamente...`);
    });

    // Erro de autenticação
    client.on('auth_failure', (msg) => {
      console.error(`❌ Falha de autenticação para ${tenant.name}:`, msg);
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.status = 'auth_failed';
      }
      // NÃO chamar LocalAuth.logout() - deixe o LocalAuth gerenciar
    });

    // Mensagens recebidas - DETECÇÃO AUTOMÁTICA DE CÓDIGOS
    console.log(`👂 Configurando listener de mensagens para ${tenant.name}`);
    client.on('message', async (msg) => {
      console.log(`\n⚡ EVENTO MESSAGE RECEBIDO - Tenant: ${tenant.name}`);
      try {
        await this.handleIncomingMessage(tenantId, msg);
      } catch (error) {
        console.error(`❌ ERRO CRÍTICO ao processar mensagem do tenant ${tenantId}:`, error);
        console.error(`Stack:`, error.stack);
      }
    });

    // Inicializar cliente
    client.initialize();

    return client;
  }

  async handleIncomingMessage(tenantId, msg) {
    try {
      const clientData = this.clients.get(tenantId);
      if (!clientData) {
        console.log('⚠️ Cliente não encontrado para tenant:', tenantId);
        return;
      }

      const tenant = clientData.tenant;
      const messageText = msg.body || '';
      
      console.log(`\n📨 ========== NOVA MENSAGEM ==========`);
      console.log(`📱 Tenant: ${tenant.name} (${tenantId})`);
      console.log(`💬 Mensagem: "${messageText}"`);
      
      // Detectar códigos de produtos (C seguido de números, case insensitive)
      const productCodeRegex = /C(\d+)/gi;
      const matches = [...messageText.matchAll(productCodeRegex)];
      
      if (matches.length === 0) {
        console.log(`ℹ️ Nenhum código de produto detectado (formato esperado: C1, C123, etc.)`);
        return;
      }

      const codes = matches.map(match => match[0].toUpperCase());
      console.log(`✅ Códigos detectados:`, codes.join(', '));

      // Obter telefone do remetente
      const contact = await msg.getContact();
      const customerPhone = contact.number;
      
      // Verificar se é mensagem de grupo
      const chat = await msg.getChat();
      const isGroup = chat.isGroup;
      const groupName = isGroup ? chat.name : null;

      console.log(`👤 Cliente: ${customerPhone}`);
      if (isGroup) {
        console.log(`👥 Grupo: ${groupName}`);
      }

      // Processar cada código detectado via Edge Function
      for (const code of codes) {
        try {
          console.log(`\n🔄 Processando código ${code}...`);
          console.log(`📞 API: ${SUPABASE_URL}/functions/v1/whatsapp-process-message`);
          
          const requestBody = {
            tenant_id: tenantId,
            customer_phone: customerPhone,
            message: code,
            group_name: groupName
          };
          
          console.log(`📤 Enviando dados:`, JSON.stringify(requestBody, null, 2));
          
          const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-process-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
            },
            body: JSON.stringify(requestBody)
          });

          console.log(`📥 Status da resposta: ${response.status} ${response.statusText}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Erro na edge function para ${code}:`, errorText);
            continue;
          }

          const result = await response.json();
          console.log(`✅ Código ${code} processado com sucesso!`);
          console.log(`📊 Resultado:`, JSON.stringify(result, null, 2));

        } catch (error) {
          console.error(`❌ Erro crítico ao processar código ${code}:`, error.message);
          console.error(`🔍 Stack trace:`, error.stack);
        }
      }
      
      console.log(`\n========== FIM DO PROCESSAMENTO ==========\n`);
      
    } catch (error) {
      console.error(`❌ Erro fatal em handleIncomingMessage:`, error.message);
      console.error(`🔍 Stack trace:`, error.stack);
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

    // Se não houver conteúdo (204 No Content ou 201 Created sem body), retornar null
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
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
  
  // Remover DDI 55 se tiver para processar apenas DDD+número
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Validar tamanho mínimo
  if (clean.length < 10) {
    console.warn(`⚠️ Telefone muito curto: ${phone}`);
    return '55' + clean + '@c.us';
  }
  
  // Extrair DDD (2 primeiros dígitos)
  const ddd = parseInt(clean.substring(0, 2));
  
  console.log(`📞 Normalizando: ${phone} → DDD: ${ddd}, Número: ${clean}`);
  
  // Aplicar regra específica baseada no DDD
  if (ddd >= 31) {
    // DDD >= 31: REMOVER 9º dígito se presente
    if (clean.length === 11 && clean[2] === '9') {
      // Tem 11 dígitos e 3º é '9' → remover o 9
      clean = clean.substring(0, 2) + clean.substring(3);
      console.log(`✅ DDD ${ddd} >= 31: 9º dígito removido → ${clean}`);
    } else if (clean.length === 10) {
      console.log(`✅ DDD ${ddd} >= 31: já está sem 9º dígito → ${clean}`);
    }
  } else {
    // DDD < 31: ADICIONAR 9º dígito se não presente
    if (clean.length === 10 && clean[2] !== '9') {
      // Tem 10 dígitos e 3º não é '9' → adicionar o 9
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log(`✅ DDD ${ddd} < 31: 9º dígito adicionado → ${clean}`);
    } else if (clean.length === 11 && clean[2] === '9') {
      console.log(`✅ DDD ${ddd} < 31: já tem 9º dígito → ${clean}`);
    }
  }
  
  // Adicionar DDI 55 e formato WhatsApp
  const normalized = '55' + clean + '@c.us';
  console.log(`📱 Número final para WhatsApp: ${normalized}`);
  
  return normalized;
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

  // Processar mensagem recebida manualmente (para testes)
  app.post('/process-incoming-message', async (req, res) => {
    const { tenantId } = req;
    const { customer_phone, message, group_name } = req.body;

    console.log(`\n🧪 ========== TESTE MANUAL DE PROCESSAMENTO ==========`);
    console.log(`📱 Tenant ID: ${tenantId}`);
    console.log(`📞 Telefone: ${customer_phone}`);
    console.log(`💬 Mensagem: "${message}"`);
    console.log(`👥 Grupo: ${group_name || 'N/A'}`);

    if (!tenantId) {
      console.error(`❌ tenant_id não fornecido`);
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id obrigatório (via header x-tenant-id ou query ?tenantId=xxx)' 
      });
    }

    try {
      console.log(`🔄 Chamando edge function...`);
      console.log(`📍 URL: ${SUPABASE_URL}/functions/v1/whatsapp-process-message`);
      
      const requestBody = {
        tenant_id: tenantId,
        customer_phone,
        message,
        group_name
      };
      
      console.log(`📤 Body:`, JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-process-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`📥 Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Erro da edge function:`, errorText);
        throw new Error(errorText);
      }

      const result = await response.json();
      console.log(`✅ Resultado:`, JSON.stringify(result, null, 2));
      console.log(`========== FIM DO TESTE ==========\n`);

      res.json({ 
        success: true, 
        result 
      });
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error.message);
      console.error('Stack:', error.stack);
      console.log(`========== FIM DO TESTE (COM ERRO) ==========\n`);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  return app;
}

// ==================== ENCERRAMENTO GRACIOSO ====================
const tenantManager = new TenantManager();

process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  for (const [tenantId, data] of tenantManager.clients.entries()) {
    try {
      console.log(`🔄 Destruindo cliente ${data.tenant.name}...`);
      await data.client.destroy();
    } catch (error) {
      console.log(`⚠️ Erro ao destruir ${data.tenant.name}:`, error.message);
    }
  }
  console.log('✅ Servidor encerrado');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Encerrando servidor (SIGTERM)...');
  for (const [tenantId, data] of tenantManager.clients.entries()) {
    try {
      await data.client.destroy();
    } catch (error) {
      console.log(`⚠️ Erro ao destruir ${data.tenant.name}:`, error.message);
    }
  }
  process.exit(0);
});

// ==================== INICIALIZAÇÃO ====================
async function main() {
  console.log('🚀 Iniciando servidor WhatsApp Multi-Tenant...\n');

  // Verificar variáveis de ambiente
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY não configurada!');
    process.exit(1);
  }

  const supabaseHelper = new SupabaseHelper(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Carregar apenas o tenant MANIA DE MULHER
  console.log('📋 Carregando tenant MANIA DE MULHER...');
  const MANIA_DE_MULHER_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
  
  const allTenants = await supabaseHelper.loadActiveTenants();
  const tenants = allTenants.filter(t => t.id === MANIA_DE_MULHER_ID);
  
  if (tenants.length === 0) {
    console.error('❌ Tenant MANIA DE MULHER não encontrado!');
    console.log('Tenants disponíveis:', allTenants.map(t => `${t.name} (${t.id})`).join(', '));
    process.exit(1);
  }
  
  console.log(`✅ Tenant encontrado: ${tenants[0].name}\n`);

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
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ SERVIDOR WHATSAPP MULTI-TENANT ATIVO`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🔌 Porta: ${PORT}`);
    console.log(`📊 Supabase: ${SUPABASE_URL}`);
    console.log(`\n📱 FUNCIONALIDADES ATIVAS:`);
    console.log(`   ✓ Envio de mensagens individuais`);
    console.log(`   ✓ Envio de mensagens em grupo`);
    console.log(`   ✓ Detecção automática de códigos de produtos`);
    console.log(`   ✓ Criação automática de pedidos`);
    console.log(`\n🤖 DETECÇÃO AUTOMÁTICA:`);
    console.log(`   Quando receber mensagens com códigos (C1, C2, C123, etc)`);
    console.log(`   o sistema irá:`);
    console.log(`   1. Buscar o produto no banco de dados`);
    console.log(`   2. Verificar/criar pedido do cliente`);
    console.log(`   3. Adicionar produto ao pedido`);
    console.log(`   4. Enviar confirmação via WhatsApp`);
    console.log(`\n🔐 Escaneie os QR Codes acima para conectar cada tenant`);
    console.log(`${'='.repeat(60)}\n`);
  });
}

// Executar
main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
