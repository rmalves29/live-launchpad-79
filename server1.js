const { Client, LocalAuth, NoAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const https = require('https');

// ==================== CONFIGURAÇÃO ====================
const PORT = process.env.PORT || 3333;
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';

// Diretório de autenticação
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');

// Função para baixar HTML do WhatsApp Web
async function downloadWhatsAppHTML() {
  const cacheDir = path.join(__dirname, '.wwebjs_cache');
  const cacheFile = path.join(cacheDir, 'whatsapp-web.html');
  
  // Se já existe e tem menos de 24h, não baixa novamente
  if (fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    const age = Date.now() - stats.mtimeMs;
    if (age < 24 * 60 * 60 * 1000) {
      console.log('✅ Cache do WhatsApp Web já existe e é recente');
      return;
    }
  }
  
  console.log('📥 Baixando versão estável do WhatsApp Web...');
  
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  const url = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html';
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Falha ao baixar: ${response.statusCode}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(cacheFile);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        console.log('✅ WhatsApp Web HTML baixado com sucesso');
        resolve();
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(cacheFile, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

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
    const showBrowser = process.env.SHOW_BROWSER === 'true';
    const puppeteerConfig = {
      headless: !showBrowser,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled'
      ],
      timeout: 0, // Sem timeout
      protocolTimeout: 0
    };
    
    if (showBrowser) {
      console.log('🌐 Modo navegador visível ativado - você verá o Chrome');
    }

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

    const cacheFile = path.join(__dirname, '.wwebjs_cache', 'whatsapp-web.html');
    
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: tenantId,
        dataPath: AUTH_DIR
      }),
      puppeteer: puppeteerConfig,
      webVersionCache: {
        type: 'local',
        path: cacheFile
      },
      qrMaxRetries: 5,
      authTimeoutMs: 0,
      bypassCSP: true
    });

    // Status inicial
    this.clients.set(tenantId, {
      client,
      status: 'initializing',
      qr: null,
      tenant
    });

    // Log de debug para eventos do Puppeteer
    client.pupBrowser?.on('targetcreated', () => {
      console.log(`🔍 ${tenant.name} - Puppeteer: Nova aba criada`);
    });
    
    client.pupBrowser?.on('disconnected', () => {
      console.log(`⚠️ ${tenant.name} - Puppeteer: Navegador desconectado`);
    });

    // QR Code
    client.on('qr', (qr) => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📱 QR CODE GERADO PARA ${tenant.name.toUpperCase()}`);
      console.log(`${'='.repeat(70)}\n`);
      
      qrcode.generate(qr, { small: true });
      
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.qr = qr;
        clientData.status = 'qr_ready';
      }
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🌐 Acesse no navegador: http://localhost:3333/qr/${tenantId}`);
      console.log(`${'='.repeat(70)}\n`);
    });

    // Evento de carregamento (mostra progresso)
    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ ${tenant.name} - Carregando: ${percent}% - ${message}`);
    });

    // Autenticado
    client.on('authenticated', () => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ ${tenant.name.toUpperCase()} - AUTENTICADO COM SUCESSO!`);
      console.log(`${'='.repeat(70)}`);
      console.log(`⏳ Aguardando evento 'ready' para ficar online...`);
      console.log(`${'='.repeat(70)}\n`);
      
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.status = 'authenticated';
        clientData.qr = null;
      }
    });

    // Pronto
    client.on('ready', async () => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🚀 ${tenant.name.toUpperCase()} - ESTÁ PRONTO E ONLINE!`);
      console.log(`${'='.repeat(70)}`);
      
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.status = 'online';
      }
      
      // Buscar e exibir informações do WhatsApp conectado
      try {
        const info = await client.info;
        console.log(`📱 WhatsApp: ${info.wid.user}`);
        console.log(`📱 Plataforma: ${info.platform}`);
        console.log(`📱 Bateria: ${info.battery}%`);
      } catch (error) {
        console.log(`⚠️ Não foi possível obter info do WhatsApp:`, error.message);
      }
      
      console.log(`${'='.repeat(70)}`);
      console.log(`✅ ${tenant.name} pode enviar e receber mensagens agora!`);
      console.log(`${'='.repeat(70)}\n`);
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
    client.on('message', async (msg) => {
      try {
        await this.handleIncomingMessage(tenantId, msg);
      } catch (error) {
        console.error(`❌ Erro ao processar mensagem do tenant ${tenantId}:`, error);
      }
    });

    // Inicializar cliente
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔌 INICIALIZANDO ${tenant.name.toUpperCase()}`);
    console.log(`ID: ${tenantId}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`⏳ Carregando WhatsApp Web...`);
    console.log(`⏳ Isso pode levar alguns minutos...`);
    console.log(`${'='.repeat(70)}\n`);
    
    try {
      await client.initialize();
      console.log(`✅ ${tenant.name} - Initialize() concluído com sucesso`);
    } catch (err) {
      console.error(`\n${'='.repeat(70)}`);
      console.error(`❌ ERRO CRÍTICO AO INICIALIZAR ${tenant.name}`);
      console.error(`${'='.repeat(70)}`);
      console.error(`Tipo: ${err.name}`);
      console.error(`Mensagem: ${err.message}`);
      console.error(`Stack: ${err.stack}`);
      console.error(`${'='.repeat(70)}\n`);
      
      const clientData = this.clients.get(tenantId);
      if (clientData) {
        clientData.status = 'error';
        clientData.error = err.message;
      }
      
      throw err; // Re-lançar o erro para ser tratado no main()
    }

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
  
  // Adicionar DDI 55 se não tiver
  if (!clean.startsWith('55')) {
    clean = '55' + clean;
  }
  
  // Extrair DDD (posições 2-3 após o DDI 55)
  const ddd = parseInt(clean.substring(2, 4));
  
  // Regra: DDD >= 31 remove o 9º dígito, DDD < 31 adiciona o 9º dígito
  if (ddd >= 31) {
    // DDD >= 31: remover o 9º dígito se existir
    if (clean.length === 13 && clean[4] === '9') {
      clean = clean.slice(0, 4) + clean.slice(5);
      console.log(`📱 DDD ${ddd} >= 31: removido 9º dígito → ${clean}`);
    }
  } else {
    // DDD < 31: adicionar o 9º dígito se não existir
    if (clean.length === 12 && clean[4] !== '9') {
      clean = clean.slice(0, 4) + '9' + clean.slice(4);
      console.log(`📱 DDD ${ddd} < 31: adicionado 9º dígito → ${clean}`);
    }
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

  // Status de um tenant específico (DETALHADO)
  app.get('/status/:tenantId', async (req, res) => {
    const { tenantId } = req.params;
    const clientData = tenantManager.clients.get(tenantId);
    
    if (!clientData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Tenant não encontrado',
        available_tenants: Array.from(tenantManager.clients.keys())
      });
    }

    const status = {
      success: true,
      tenant_id: tenantId,
      tenant_name: clientData.tenant.name,
      status: clientData.status,
      qr_available: !!clientData.qr,
      timestamp: new Date().toISOString()
    };

    // Se estiver online, adicionar info do WhatsApp
    if (clientData.status === 'online' && clientData.client) {
      try {
        const info = await clientData.client.info;
        status.whatsapp_info = {
          wid: info.wid._serialized,
          platform: info.platform,
          phone: info.wid.user
        };
      } catch (error) {
        console.error('⚠️ Erro ao buscar info do WhatsApp:', error.message);
        status.whatsapp_info_error = error.message;
      }
    }

    console.log(`📊 Status consultado para ${clientData.tenant.name}:`, status);
    
    res.json(status);
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

  // Visualizar QR Code via browser
  app.get('/qr/:tenantId', (req, res) => {
    const { tenantId } = req.params;
    const clientData = tenantManager.clients.get(tenantId);
    
    if (!clientData) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>QR Code - Tenant não encontrado</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1>❌ Tenant não encontrado</h1>
          <p>Tenant ID: ${tenantId}</p>
        </body>
        </html>
      `);
    }

    if (!clientData.qr) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="refresh" content="3">
          <title>QR Code - ${clientData.tenant.name}</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; background: #f0f0f0; }
            .container { background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
            h1 { color: #25D366; }
            .status { font-size: 24px; margin: 20px 0; }
            .info { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📱 ${clientData.tenant.name}</h1>
            <div class="status">
              ${clientData.status === 'online' ? '✅ Conectado!' : 
                clientData.status === 'authenticated' ? '🔄 Autenticando...' :
                clientData.status === 'initializing' ? '⏳ Inicializando...' :
                '⏳ Aguardando QR Code...'}
            </div>
            <p class="info">Status: ${clientData.status}</p>
            ${clientData.status !== 'online' ? '<p class="info">Atualizando a cada 3 segundos...</p>' : ''}
          </div>
        </body>
        </html>
      `);
    }

    // Gerar QR Code como imagem
    const QRCode = require('qrcode');
    QRCode.toDataURL(clientData.qr, (err, url) => {
      if (err) {
        return res.status(500).send('Erro ao gerar QR Code');
      }

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>QR Code - ${clientData.tenant.name}</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; background: #f0f0f0; }
            .container { background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
            h1 { color: #25D366; }
            img { max-width: 100%; height: auto; border: 2px solid #25D366; border-radius: 10px; }
            .instructions { margin-top: 20px; color: #666; text-align: left; }
            .instructions ol { padding-left: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📱 ${clientData.tenant.name}</h1>
            <p>Escaneie o QR Code com o WhatsApp</p>
            <img src="${url}" alt="QR Code">
            <div class="instructions">
              <h3>📋 Como conectar:</h3>
              <ol>
                <li>Abra o WhatsApp no celular</li>
                <li>Toque em <strong>Mais opções (⋮)</strong> ou <strong>Configurações</strong></li>
                <li>Toque em <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li>Aponte a câmera para este QR Code</li>
              </ol>
            </div>
          </div>
        </body>
        </html>
      `);
    });
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

    console.log('\n📨 ===== NOVA REQUISIÇÃO DE ENVIO =====');
    console.log(`🔑 Tenant ID: ${tenantId}`);
    console.log(`📞 Telefone original: ${phone}`);
    console.log(`💬 Mensagem (${message.length} chars):`, message.substring(0, 100) + '...');

    if (!tenantId) {
      console.error('❌ tenant_id não fornecido');
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id obrigatório' 
      });
    }

    if (!phone || !message) {
      console.error('❌ phone ou message faltando');
      return res.status(400).json({ 
        success: false, 
        error: 'phone e message são obrigatórios' 
      });
    }

    const clientData = tenantManager.clients.get(tenantId);
    console.log(`🔍 Status do cliente:`, clientData ? clientData.status : 'NÃO ENCONTRADO');
    
    const client = tenantManager.getOnlineClient(tenantId);
    if (!client) {
      console.error(`\n${'='.repeat(70)}`);
      console.error(`❌ ERRO: WhatsApp não está ONLINE para tenant ${tenantId}`);
      console.error(`${'='.repeat(70)}`);
      console.error(`   Status atual: ${clientData?.status || 'não inicializado'}`);
      console.error(`${'='.repeat(70)}`);
      
      let errorMessage = 'WhatsApp não conectado';
      let instructions = '';
      
      if (clientData?.status === 'qr_ready') {
        errorMessage = 'QR Code aguardando leitura';
        instructions = `\n\n📱 INSTRUÇÕES:\n` +
                      `1. Abra o WhatsApp no seu celular\n` +
                      `2. Vá em Aparelhos Conectados\n` +
                      `3. Escaneie o QR Code em: http://localhost:3333/qr/${tenantId}\n` +
                      `4. Aguarde o WhatsApp conectar completamente\n\n` +
                      `⏳ O status atual é: ${clientData.status}\n` +
                      `✅ Precisa ser: online`;
        console.error(instructions);
      } else if (clientData?.status === 'authenticated') {
        errorMessage = 'WhatsApp autenticado mas não está pronto ainda';
        instructions = '\n\n⏳ Aguarde alguns segundos, o WhatsApp está carregando...';
        console.error(instructions);
      } else if (clientData?.status === 'initializing') {
        errorMessage = 'WhatsApp ainda está inicializando';
        instructions = '\n\n⏳ Aguarde o QR Code aparecer...';
        console.error(instructions);
      }
      
      console.error(`${'='.repeat(70)}\n`);
      
      return res.status(503).json({ 
        success: false, 
        error: errorMessage,
        status: clientData?.status || 'não inicializado',
        instructions: instructions.trim()
      });
    }

    try {
      const normalizedPhone = normalizePhone(phone);
      console.log(`📤 Telefone normalizado: ${normalizedPhone}`);
      console.log(`⏳ Enviando mensagem via WhatsApp Web...`);
      
      const sendStart = Date.now();
      await client.sendMessage(normalizedPhone, message);
      const sendDuration = Date.now() - sendStart;
      
      console.log(`✅ Mensagem enviada com sucesso em ${sendDuration}ms`);
      
      // Logar no Supabase
      console.log(`💾 Registrando no Supabase...`);
      await supabaseHelper.logMessage(
        tenantId,
        phone,
        message,
        'individual'
      );
      console.log(`✅ Registro no Supabase concluído`);

      console.log(`🎉 ===== ENVIO CONCLUÍDO COM SUCESSO =====\n`);

      res.json({ 
        success: true, 
        message: 'Mensagem enviada com sucesso',
        phone: normalizedPhone,
        duration_ms: sendDuration
      });
    } catch (error) {
      console.error('\n❌ ===== ERRO NO ENVIO =====');
      console.error('Tipo:', error.name);
      console.error('Mensagem:', error.message);
      console.error('Stack:', error.stack);
      console.error('===== FIM DO ERRO =====\n');
      
      res.status(500).json({ 
        success: false, 
        error: error.message,
        error_type: error.name
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

  // Baixar HTML do WhatsApp Web antes de iniciar
  try {
    await downloadWhatsAppHTML();
  } catch (error) {
    console.error('⚠️ Erro ao baixar WhatsApp Web HTML:', error.message);
    console.log('⚠️ Continuando mesmo assim...');
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
    try {
      await tenantManager.createClient(tenant);
      await delay(2000); // Delay entre inicializações
    } catch (error) {
      console.error(`❌ Erro ao inicializar ${tenant.name}:`, error.message);
      console.error(`⚠️ Tentando continuar mesmo assim...`);
    }
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
