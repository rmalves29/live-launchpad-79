/**
 * ========================================
 * WhatsApp Multi-Tenant Server - Clean Architecture
 * ========================================
 * 
 * Sistema robusto para gerenciar múltiplos clientes WhatsApp
 * Cada tenant (empresa) tem sua própria conexão WhatsApp isolada
 * 
 * Autor: Sistema OrderZaps
 * Versão: 4.0 (Clean Architecture)
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Polyfill fetch para Node.js
if (typeof fetch !== 'function') {
  global.fetch = require('node-fetch');
}

/* ============================================================
   CONFIGURAÇÃO
   ============================================================ */

const CONFIG = {
  PORT: process.env.PORT || 3333,
  SUPABASE_URL: 'https://hxtbsieodbtzgcvvkeqx.supabase.co',
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY || 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA',
  AUTH_DIR: path.join(__dirname, '.wwebjs_auth_clean'),
  
  // Configurações específicas por tenant (se necessário)
  TENANTS: {
    // ID da MANIA DE MULHER - pode adicionar outros aqui
    'MANIA_DE_MULHER': '08f2b1b9-3988-489e-8186-c60f0c0b0622'
  }
};

/* ============================================================
   GERENCIADOR DE TENANTS
   ============================================================ */

class TenantManager {
  constructor() {
    this.clients = new Map();      // tenantId -> WhatsApp Client
    this.status = new Map();        // tenantId -> status string
    this.authDirs = new Map();      // tenantId -> auth directory path
  }

  /**
   * Cria diretório de autenticação para um tenant
   */
  createAuthDir(tenantId) {
    const tenantDir = path.join(CONFIG.AUTH_DIR, `tenant_${tenantId}`);
    
    if (!fs.existsSync(CONFIG.AUTH_DIR)) {
      fs.mkdirSync(CONFIG.AUTH_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    
    this.authDirs.set(tenantId, tenantDir);
    return tenantDir;
  }

  /**
   * Cria e inicializa cliente WhatsApp para um tenant
   */
  async createClient(tenant) {
    const tenantId = tenant.id;
    const authDir = this.createAuthDir(tenantId);
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔧 Inicializando: ${tenant.name}`);
    console.log(`🆔 ID: ${tenantId}`);
    console.log(`📂 Auth: ${authDir}`);
    console.log(`${'='.repeat(70)}\n`);

    // Verificar se já existe sessão salva
    const sessionPath = path.join(authDir, 'session');
    const hasSession = fs.existsSync(sessionPath);
    
    if (hasSession) {
      console.log(`📱 Sessão existente encontrada para ${tenant.name}`);
      console.log(`🔄 Tentando restaurar sessão...\n`);
    } else {
      console.log(`📱 Primeira inicialização para ${tenant.name}`);
      console.log(`📸 QR Code será exibido em breve...\n`);
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `tenant_${tenantId}`,
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
          '--disable-extensions',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-blink-features=AutomationControlled',
        ],
        timeout: 90000,
        protocolTimeout: 300000
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
      },
      qrMaxRetries: 5,
      authTimeoutMs: 90000,
      restartOnAuthFail: true,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 90000
    });

    // Event: QR Code gerado
    client.on('qr', (qr) => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📱 QR CODE - ${tenant.name}`);
      console.log(`${'='.repeat(70)}`);
      console.log(`\n⚠️ Abra o WhatsApp no celular e escaneie o código:\n`);
      
      try {
        // Gerar QR Code no terminal
        const qrcode = require('qrcode-terminal');
        qrcode.generate(qr, { small: true });
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`💡 Dica: Se o QR está muito pequeno, aumente o zoom do terminal`);
        console.log(`${'='.repeat(70)}\n`);
      } catch (error) {
        console.error(`❌ Erro ao gerar QR no terminal:`, error.message);
        console.log(`\n📋 QR Code (texto):\n${qr}\n`);
      }
      
      this.status.set(tenantId, 'qr_code');
    });

    // Event: Carregando
    client.on('loading_screen', (percent) => {
      console.log(`⏳ ${tenant.name}: Carregando ${percent}%`);
    });

    // Event: Autenticado
    client.on('authenticated', () => {
      console.log(`🔐 ${tenant.name}: Autenticado`);
      this.status.set(tenantId, 'authenticated');
    });

    // Event: Pronto!
    client.on('ready', () => {
      console.log(`\n✅✅✅ ${tenant.name}: CONECTADO ✅✅✅\n`);
      this.status.set(tenantId, 'online');
    });

    // Event: Falha na autenticação
    client.on('auth_failure', (msg) => {
      console.error(`❌ ${tenant.name}: Falha na autenticação:`, msg);
      this.status.set(tenantId, 'auth_failure');
    });

    // Event: Desconectado
    client.on('disconnected', (reason) => {
      console.warn(`🔌 ${tenant.name}: Desconectado - ${reason}`);
      this.status.set(tenantId, 'offline');
      
      // Reconectar após 10 segundos
      console.log(`🔄 ${tenant.name}: Reconectando em 10s...`);
      setTimeout(async () => {
        try {
          console.log(`🔄 ${tenant.name}: Tentando reconectar...`);
          await client.initialize();
        } catch (error) {
          console.error(`❌ ${tenant.name}: Erro ao reconectar:`, error.message);
        }
      }, 10000);
    });

    // Salvar cliente
    this.clients.set(tenantId, client);
    this.status.set(tenantId, 'initializing');

    // Inicializar
    console.log(`🔄 ${tenant.name}: Iniciando conexão com WhatsApp Web...`);
    console.log(`⏰ Aguarde - pode levar até 2 minutos...\n`);

    // Timeout de segurança aumentado
    const initTimeout = setTimeout(() => {
      const currentStatus = this.status.get(tenantId);
      if (currentStatus !== 'online' && currentStatus !== 'authenticated') {
        console.error(`\n⏱️ TIMEOUT: ${tenant.name} - Não conectou em 150s`);
        console.error(`📊 Status atual: ${currentStatus}`);
        console.error(`\n💡 Soluções:`);
        console.error(`   1. Feche TODAS as abas do WhatsApp Web no navegador`);
        console.error(`   2. Tente limpar a pasta de autenticação:`);
        console.error(`      ${authDir}`);
        console.error(`   3. Reinicie este servidor (Ctrl+C e rode novamente)`);
        console.error(`   4. Se persistir, reinicie o computador\n`);
        this.status.set(tenantId, 'timeout');
      }
    }, 150000);

    try {
      console.log(`⚙️ ${tenant.name}: Inicializando Puppeteer...`);
      await client.initialize();
      clearTimeout(initTimeout);
      console.log(`✅ ${tenant.name}: Inicialização completa!`);
    } catch (error) {
      clearTimeout(initTimeout);
      console.error(`❌ ${tenant.name}: Erro na inicialização:`, error.message);
      console.error(`📋 Detalhes do erro:`, error.stack);
      this.status.set(tenantId, 'error');
      
      console.log(`\n🔧 Tentativas de solução:`);
      console.log(`   1. Delete a pasta: ${authDir}`);
      console.log(`   2. Reinicie o servidor`);
      console.log(`   3. Verifique se há outro WhatsApp Web aberto\n`);
    }

    return client;
  }

  /**
   * Obtém cliente de um tenant se estiver online
   */
  async getOnlineClient(tenantId) {
    const client = this.clients.get(tenantId);
    const status = this.status.get(tenantId);

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

  /**
   * Obtém status de todos os tenants
   */
  getAllStatus() {
    const result = {};
    
    for (const [tenantId, client] of this.clients) {
      result[tenantId] = {
        status: this.status.get(tenantId) || 'unknown',
        hasClient: !!client
      };
    }
    
    return result;
  }

  /**
   * Obtém status de um tenant específico
   */
  getTenantStatus(tenantId) {
    return {
      status: this.status.get(tenantId) || 'not_found',
      hasClient: this.clients.has(tenantId)
    };
  }
}

/* ============================================================
   HELPERS SUPABASE
   ============================================================ */

class SupabaseHelper {
  static async request(pathname, options = {}) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1${pathname}`;
    const headers = {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase ${response.status}: ${error}`);
    }

    return response.json();
  }

  static async loadActiveTenants() {
    try {
      const tenants = await this.request(
        '/tenants?select=id,name,slug,is_active&is_active=eq.true'
      );
      return tenants;
    } catch (error) {
      console.error('❌ Erro ao carregar tenants:', error.message);
      return [];
    }
  }

  static async getWhatsAppIntegration(tenantId) {
    try {
      const integrations = await this.request(
        `/integration_whatsapp?select=*&tenant_id=eq.${tenantId}&is_active=eq.true&limit=1`
      );
      return integrations[0] || null;
    } catch (error) {
      console.error('❌ Erro ao carregar integração WhatsApp:', error.message);
      return null;
    }
  }

  static async logMessage(tenantId, phone, message, type, metadata = {}) {
    try {
      await this.request('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          phone,
          message,
          type,
          sent_at: type === 'outgoing' ? new Date().toISOString() : null,
          received_at: type === 'incoming' ? new Date().toISOString() : null,
          ...metadata
        })
      });
    } catch (error) {
      console.error('⚠️ Erro ao salvar log no banco:', error.message);
    }
  }
}

/* ============================================================
   UTILITÁRIOS
   ============================================================ */

/**
 * Normaliza número de telefone brasileiro para WhatsApp
 */
function normalizePhone(phone) {
  if (!phone) return phone;
  
  const clean = phone.replace(/\D/g, '');
  const withoutDDI = clean.startsWith('55') ? clean.substring(2) : clean;
  
  let normalized = withoutDDI;
  
  // Adicionar 9º dígito se necessário
  if (normalized.length >= 10 && normalized.length <= 11) {
    const ddd = parseInt(normalized.substring(0, 2));
    
    if (ddd >= 11 && ddd <= 99) {
      if (normalized.length === 10) {
        const firstDigit = normalized[2];
        if (firstDigit !== '9') {
          normalized = normalized.substring(0, 2) + '9' + normalized.substring(2);
          console.log(`✅ 9º dígito adicionado: ${phone} -> ${normalized}`);
        }
      }
    }
  }
  
  return '55' + normalized;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ============================================================
   EXPRESS APP
   ============================================================ */

async function createApp(tenantManager) {
  const app = express();
  
  app.use(express.json({ limit: '10mb' }));
  app.use(cors());

  // Middleware: Extrair tenant_id
  app.use((req, res, next) => {
    const tenantId = 
      req.headers['x-tenant-id'] ||
      req.headers['X-Tenant-Id'] ||
      req.query.tenant_id ||
      req.body?.tenant_id;

    if (tenantId) {
      req.tenantId = tenantId;
    }

    next();
  });

  // ==================== ROTAS ====================

  // Health Check
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'online',
      timestamp: new Date().toISOString(),
      version: '4.0-clean'
    });
  });

  // Status Geral
  app.get('/status', (req, res) => {
    const allStatus = tenantManager.getAllStatus();
    
    res.json({
      success: true,
      tenants: allStatus,
      totalTenants: Object.keys(allStatus).length
    });
  });

  // Status de Tenant Específico
  app.get('/status/:tenantId', (req, res) => {
    const { tenantId } = req.params;
    const status = tenantManager.getTenantStatus(tenantId);
    
    res.json({
      success: true,
      tenantId,
      ...status
    });
  });

  // Enviar Mensagem
  app.post('/send', async (req, res) => {
    try {
      const { number, message, phone } = req.body;
      const tenantId = req.tenantId;

      console.log('\n📨 [POST /send] Nova requisição');
      console.log('🔑 Tenant ID:', tenantId);
      console.log('📞 Telefone:', number || phone);

      // Validar tenant_id
      if (!tenantId) {
        console.error('❌ Tenant ID não fornecido');
        return res.status(400).json({
          success: false,
          error: 'Tenant ID obrigatório (x-tenant-id header ou tenant_id no body)'
        });
      }

      const phoneNumber = number || phone;

      // Validar dados
      if (!phoneNumber || !message) {
        console.error('❌ Dados incompletos');
        return res.status(400).json({
          success: false,
          error: 'Número e mensagem são obrigatórios'
        });
      }

      // Buscar cliente do tenant
      console.log(`🔍 Buscando cliente WhatsApp do tenant: ${tenantId}`);
      const client = await tenantManager.getOnlineClient(tenantId);

      if (!client) {
        console.error(`❌ Cliente não conectado: ${tenantId}`);
        return res.status(503).json({
          success: false,
          error: 'WhatsApp não conectado. Escaneie o QR Code primeiro.'
        });
      }

      // Normalizar telefone
      const normalizedPhone = normalizePhone(phoneNumber);
      const chatId = `${normalizedPhone}@c.us`;

      console.log(`📤 Enviando mensagem para: ${normalizedPhone}`);

      // Enviar mensagem
      try {
        await client.sendMessage(chatId, message);
        console.log(`✅ Mensagem enviada com sucesso!`);
      } catch (sendError) {
        console.error(`❌ Erro ao enviar:`, sendError.message);
        throw new Error(`Falha ao enviar: ${sendError.message}`);
      }

      // Salvar log no banco (não bloqueia resposta)
      SupabaseHelper.logMessage(
        tenantId,
        normalizedPhone,
        message,
        'outgoing'
      ).catch(err => console.error('⚠️ Log ignorado:', err.message));

      // Resposta de sucesso
      res.json({
        success: true,
        message: 'Mensagem enviada',
        phone: normalizedPhone,
        tenantId
      });

    } catch (error) {
      console.error('❌ Erro no endpoint /send:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro ao enviar mensagem'
      });
    }
  });

  // Rota 404
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Rota não encontrada'
    });
  });

  return app;
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

async function main() {
  console.clear();
  console.log(`\n${'='.repeat(70)}`);
  console.log('🚀 WhatsApp Multi-Tenant Server - Clean Architecture v4.0');
  console.log(`${'='.repeat(70)}\n`);

  // Criar gerenciador de tenants
  const tenantManager = new TenantManager();

  // Carregar tenants ativos do banco
  console.log('🔍 Carregando tenants ativos...\n');
  const tenants = await SupabaseHelper.loadActiveTenants();

  if (tenants.length === 0) {
    console.warn('⚠️ Nenhum tenant ativo encontrado no banco de dados');
    console.log('💡 Certifique-se de ter tenants com is_active=true\n');
  } else {
    console.log(`📋 ${tenants.length} tenant(s) encontrado(s):\n`);
    
    // Mostrar lista de tenants
    tenants.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.name} (${t.slug})`);
      console.log(`      ID: ${t.id}\n`);
    });

    // Inicializar apenas MANIA DE MULHER (ou comentar para inicializar todos)
    const maniaDeMulher = tenants.find(
      t => t.id === CONFIG.TENANTS.MANIA_DE_MULHER
    );

    if (maniaDeMulher) {
      console.log('🎯 Inicializando apenas: MANIA DE MULHER\n');
      await tenantManager.createClient(maniaDeMulher);
    } else {
      console.warn('⚠️ Tenant MANIA DE MULHER não encontrado\n');
      
      // Descomentar para inicializar todos os tenants
      // console.log('🔄 Inicializando todos os tenants...\n');
      // for (const tenant of tenants) {
      //   const integration = await SupabaseHelper.getWhatsAppIntegration(tenant.id);
      //   if (integration) {
      //     await tenantManager.createClient(tenant);
      //     await delay(20000); // 20s entre cada tenant
      //   }
      // }
    }
  }

  // Criar servidor Express
  const app = await createApp(tenantManager);

  // Iniciar servidor
  app.listen(CONFIG.PORT, () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Servidor rodando!`);
    console.log(`📊 Status: http://localhost:${CONFIG.PORT}/status`);
    console.log(`🏥 Health: http://localhost:${CONFIG.PORT}/health`);
    console.log(`${'='.repeat(70)}\n`);
  });
}

// Executar
main().catch(error => {
  console.error('\n❌ Erro fatal:', error);
  process.exit(1);
});
