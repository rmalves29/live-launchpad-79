// Carregar variáveis de ambiente do arquivo .env
import dotenv from 'dotenv';
import baileys from '@whiskeysockets/baileys';
import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import P from 'pino';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = baileys;

dotenv.config({
  path: path.join(projectRoot, '.env'),
});

// ==================== CONFIGURAÇÃO ====================
const PORT = process.env.PORT || 3333;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const NORMALIZED_PUBLIC_BASE_URL = PUBLIC_BASE_URL.replace(/\/$/, '');
const TENANT_FILTER = process.env.TENANT_IDS || process.env.TENANT_ID || '';
const AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.join(__dirname, '.baileys_auth');

// Validar configuração
if (!SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_KEY === 'SUA_SERVICE_ROLE_KEY_AQUI') {
  console.error('\n❌ ERRO: SUPABASE_SERVICE_ROLE_KEY não configurada!\n');
  console.error('📝 COMO CORRIGIR:');
  console.error('1. Acesse: https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/settings/api');
  console.error('2. Copie a chave "service_role" (secret)');
  console.error('3. Edite o arquivo .env na raiz do projeto');
  console.error('4. Cole a chave em: SUPABASE_SERVICE_ROLE_KEY="sua_chave_aqui"\n');
  process.exit(1);
}

// Auth directory (configurable via AUTH_DIR)

// Criar diretório se não existir
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Logger do Pino (silencioso)
const logger = P({ level: 'silent' });

// ==================== TENANT MANAGER ====================
class TenantManager {
  constructor() {
    this.clients = new Map(); // Map<tenantId, { sock, status, qr, tenant, authState }>
  }

  async createClient(tenant) {
    const tenantId = tenant.id;
    
    // Evitar inicialização duplicada
    if (this.clients.has(tenantId)) {
      console.log(`⚠️ Cliente já existe para ${tenant.name}, pulando...`);
      return this.clients.get(tenantId).sock;
    }
    
    console.log(`📱 Criando cliente Baileys para tenant: ${tenant.name} (${tenantId})`);

    // Diretório de autenticação do tenant
    const authPath = path.join(AUTH_DIR, `session-${tenantId}`);
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

    // Estado de autenticação
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    // Buscar versão mais recente do Baileys
    const { version } = await fetchLatestBaileysVersion();

    // Status inicial
    this.clients.set(tenantId, {
      sock: null,
      status: 'initializing',
      qr: null,
      tenant,
      authState: { state, saveCreds }
    });

    // Criar socket do WhatsApp
    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ['OrderZaps', 'Chrome', '120.0.0'],
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      getMessage: async () => ({ conversation: '' })
    });

    // Atualizar referência do socket
    const clientData = this.clients.get(tenantId);
    clientData.sock = sock;

    // ==================== EVENTOS ====================

    // Conexão e QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📱 QR CODE GERADO PARA ${tenant.name.toUpperCase()}`);
        console.log(`${'='.repeat(70)}\n`);
        
        qrcode.generate(qr, { small: true });
        
        clientData.qr = qr;
        clientData.status = 'qr_ready';
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`🌐 Acesse no navegador: ${NORMALIZED_PUBLIC_BASE_URL}/qr/${tenantId}`);
        console.log(`${'='.repeat(70)}\n`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = statusCode || 'unknown';
        
        console.log(`\n⚠️ ${tenant.name} desconectado - Código: ${reason}`);
        
        clientData.status = 'disconnected';
        clientData.qr = null;

        // Tratar cada tipo de desconexão
        if (statusCode === DisconnectReason.loggedOut) {
          console.log(`🔴 LOGOUT (401) - limpando sessão...`);
          
          try {
            if (fs.existsSync(authPath)) {
              fs.rmSync(authPath, { recursive: true, force: true });
              console.log(`🧹 Sessão removida`);
            }
          } catch (error) {
            console.error(`⚠️ Erro ao limpar sessão:`, error.message);
          }
          
          this.clients.delete(tenantId);
          
          console.log(`📱 Reiniciando para gerar novo QR Code em 3s...`);
          setTimeout(() => this.createClient(tenant), 3000);
          
        } else if (statusCode === DisconnectReason.restartRequired) {
          console.log(`🔄 RESTART NECESSÁRIO (515) - reconectando em 2s...`);
          this.clients.delete(tenantId);
          setTimeout(() => this.createClient(tenant), 2000);
          
        } else if (statusCode === DisconnectReason.timedOut) {
          console.log(`⏱️ TIMEOUT (408) - reconectando em 5s...`);
          setTimeout(() => this.createClient(tenant), 5000);
          
        } else if (statusCode === DisconnectReason.connectionClosed) {
          console.log(`🔌 CONEXÃO FECHADA (428) - reconectando em 3s...`);
          setTimeout(() => this.createClient(tenant), 3000);
          
        } else if (statusCode === DisconnectReason.connectionReplaced) {
          console.log(`🔄 CONEXÃO SUBSTITUÍDA (440) - não reconectando`);
          this.clients.delete(tenantId);
          
        } else if (statusCode === DisconnectReason.badSession) {
          console.log(`❌ SESSÃO INVÁLIDA (500) - limpando...`);
          
          try {
            if (fs.existsSync(authPath)) {
              fs.rmSync(authPath, { recursive: true, force: true });
              console.log(`🧹 Sessão removida`);
            }
          } catch (error) {
            console.error(`⚠️ Erro ao limpar sessão:`, error.message);
          }
          
          console.log(`📱 Reiniciando para gerar novo QR Code em 3s...`);
          setTimeout(() => this.createClient(tenant), 3000);
          
        } else if (statusCode === DisconnectReason.multideviceMismatch) {
          console.log(`📱 MULTI-DEVICE MISMATCH (411) - limpando sessão...`);
          
          try {
            if (fs.existsSync(authPath)) {
              fs.rmSync(authPath, { recursive: true, force: true });
              console.log(`🧹 Sessão removida`);
            }
          } catch (error) {
            console.error(`⚠️ Erro ao limpar sessão:`, error.message);
          }
          
          console.log(`📱 Reiniciando para gerar novo QR Code em 3s...`);
          setTimeout(() => this.createClient(tenant), 3000);
          
        } else {
          console.log(`🔄 Erro ${reason} - tentando reconectar em 5s...`);
          setTimeout(() => this.createClient(tenant), 5000);
        }
      } else if (connection === 'open') {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`🚀 ${tenant.name.toUpperCase()} - CONECTADO E ONLINE!`);
        console.log(`${'='.repeat(70)}`);
        
        clientData.status = 'online';
        clientData.qr = null;
        
        // Buscar informações do usuário
        try {
          const me = sock.user;
          if (me) {
            console.log(`📱 WhatsApp: ${me.id.split(':')[0]}`);
            console.log(`📱 Nome: ${me.name || 'N/A'}`);
          }
        } catch (error) {
          console.log(`⚠️ Erro ao buscar info:`, error.message);
        }
        
        console.log(`${'='.repeat(70)}`);
        console.log(`✅ ${tenant.name} pode enviar e receber mensagens!`);
        console.log(`${'='.repeat(70)}\n`);
      } else if (connection === 'connecting') {
        console.log(`🔄 ${tenant.name} - Conectando...`);
        clientData.status = 'connecting';
      }
    });

    // Salvar credenciais quando atualizadas
    sock.ev.on('creds.update', saveCreds);

    // Mensagens recebidas - DETECÇÃO AUTOMÁTICA DE CÓDIGOS
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        try {
          // Ignorar mensagens do próprio bot
          if (msg.key.fromMe) continue;

          const messageText = msg.message?.conversation || 
                             msg.message?.extendedTextMessage?.text || '';
          
          if (!messageText) continue;

          await this.handleIncomingMessage(tenantId, msg, messageText);
        } catch (error) {
          console.error(`❌ Erro ao processar mensagem:`, error);
        }
      }
    });

    // Inicializar cliente
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔌 INICIALIZANDO ${tenant.name.toUpperCase()}`);
    console.log(`ID: ${tenantId}`);
    console.log(`${'='.repeat(70)}\n`);

    return sock;
  }

  async handleIncomingMessage(tenantId, msg, messageText) {
    const clientData = this.clients.get(tenantId);
    if (!clientData) {
      console.log('⚠️ Cliente não encontrado para tenantId:', tenantId);
      return;
    }

    const tenant = clientData.tenant;
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📨 NOVA MENSAGEM RECEBIDA (${tenant.name})`);
    console.log(`${'='.repeat(70)}`);
    console.log(`💬 Texto: "${messageText}"`);

    // Detectar códigos de produtos (C seguido de números)
    const productCodeRegex = /C(\d+)/gi;
    const matches = [...messageText.matchAll(productCodeRegex)];
    
    console.log(`🔍 Regex aplicado - Matches encontrados: ${matches.length}`);
    
    if (matches.length === 0) {
      console.log(`❌ Nenhum código de produto detectado (formato esperado: C seguido de números)`);
      console.log(`${'='.repeat(70)}\n`);
      return; // Não é uma mensagem com código de produto
    }

    const codes = matches.map(match => match[0].toUpperCase());
    console.log(`✅ Códigos detectados:`, codes);

    // Verificar se é mensagem de grupo
    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    const groupName = isGroup ? msg.key.remoteJid : null;

    // Obter telefone do remetente
    // IMPORTANTE: Em grupos, o telefone está em msg.key.participant, não em remoteJid
    let customerPhone;
    if (isGroup && msg.key.participant) {
      customerPhone = msg.key.participant.split('@')[0];
      console.log(`📊 Mensagem de GRUPO: ${groupName}`);
      console.log(`👤 Participante: ${customerPhone}`);
    } else {
      customerPhone = msg.key.remoteJid.split('@')[0];
      console.log(`📱 Mensagem INDIVIDUAL`);
      console.log(`👤 Cliente: ${customerPhone}`);
    }
    
    console.log(`🔍 RemoteJid completo: ${msg.key.remoteJid}`);
    if (msg.key.participant) console.log(`🔍 Participant completo: ${msg.key.participant}`);

    // Processar cada código detectado via Edge Function
    for (const code of codes) {
      try {
        console.log(`\n🔄 Processando código ${code}...`);
        console.log(`📤 Chamando edge function: ${SUPABASE_URL}/functions/v1/whatsapp-process-message`);
        
        const requestBody = {
          tenant_id: tenantId,
          customer_phone: customerPhone,
          message: code,
          group_name: groupName
        };
        
        console.log(`📦 Body da requisição:`, JSON.stringify(requestBody, null, 2));
        
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
          console.error(`❌ Erro na edge function para ${code}:`);
          console.error(`   Status: ${response.status}`);
          console.error(`   Resposta: ${errorText}`);
          continue;
        }

        const result = await response.json();
        console.log(`✅ Código ${code} processado com sucesso!`);
        console.log(`📊 Resultado:`, JSON.stringify(result, null, 2));

      } catch (error) {
        console.error(`❌ Erro ao processar código ${code}:`);
        console.error(`   Tipo: ${error.name}`);
        console.error(`   Mensagem: ${error.message}`);
        console.error(`   Stack:`, error.stack);
      }
    }
    
    console.log(`${'='.repeat(70)}\n`);
  }

  getOnlineClient(tenantId) {
    const clientData = this.clients.get(tenantId);
    if (!clientData || clientData.status !== 'online') {
      return null;
    }
    return clientData.sock;
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

  async getTemplate(tenantId, templateType) {
    const data = await this.request(
      `/rest/v1/whatsapp_templates?tenant_id=eq.${tenantId}&type=eq.${templateType}&select=*&limit=1`
    );
    return data[0] || null;
  }

  // NOVO: Buscar itens pendentes de envio
  async getPendingCartItems(tenantId) {
    try {
      const data = await this.request(
        `/rest/v1/cart_items?tenant_id=eq.${tenantId}&printed=eq.false&select=*,product:products(*),cart:carts(customer_phone)&order=created_at.asc&limit=50`
      );
      return data || [];
    } catch (error) {
      console.error('Erro ao buscar itens pendentes:', error);
      return [];
    }
  }

  // NOVO: Marcar item como processado
  async markCartItemProcessed(itemId) {
    try {
      await this.request(`/rest/v1/cart_items?id=eq.${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ printed: true })
      });
    } catch (error) {
      console.error('Erro ao marcar item como processado:', error);
    }
  }
}

// ==================== MONITOR DE CARRINHO ====================
class CartMonitor {
  constructor(tenantManager, supabaseHelper) {
    this.tenantManager = tenantManager;
    this.supabaseHelper = supabaseHelper;
    this.processedItems = new Set(); // Evitar duplicação
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Monitor já está rodando');
      return;
    }

    this.isRunning = true;
    console.log('\n🔍 MONITOR DE CARRINHO INICIADO');
    console.log('   Verificando novos itens a cada 5 segundos...');
    console.log('   Enviará WhatsApp automaticamente quando item for adicionado\n');

    this.monitorLoop();
  }

  async monitorLoop() {
    if (!this.isRunning) return;

    try {
      // Para cada tenant online
      for (const [tenantId, clientData] of this.tenantManager.clients.entries()) {
        if (clientData.status !== 'online') {
          continue;
        }

        // Buscar itens não processados (printed=false)
        const items = await this.supabaseHelper.getPendingCartItems(tenantId);
        
        if (items.length > 0) {
          console.log(`🔍 Encontrados ${items.length} itens pendentes para ${clientData.tenant.name}`);
        }
        
        for (const item of items) {
          // Evitar processar o mesmo item duas vezes na memória
          if (this.processedItems.has(item.id)) {
            continue;
          }
          
          // Processar item
          await this.processCartItem(tenantId, item);
          this.processedItems.add(item.id);
          
          // Pequeno delay entre mensagens para evitar sobrecarga
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch (error) {
      console.error('❌ Erro no monitor:', error.message);
    }

    // Próxima verificação em 5 segundos
    setTimeout(() => this.monitorLoop(), 5000);
  }

  async processCartItem(tenantId, item) {
    try {
      console.log(`\n📦 Novo item detectado no carrinho!`);
      console.log(`   Produto: ${item.product?.name} (${item.product?.code})`);
      console.log(`   Cliente: ${item.cart?.customer_phone}`);
      console.log(`   Quantidade: ${item.qty}`);

      const sock = this.tenantManager.getOnlineClient(tenantId);
      if (!sock) {
        console.log(`⚠️ WhatsApp offline, pulando...`);
        return;
      }

      // Buscar template
      const template = await this.supabaseHelper.getTemplate(tenantId, 'ITEM_ADDED');
      if (!template) {
        console.log(`⚠️ Template ITEM_ADDED não encontrado`);
        return;
      }

      // Formatar mensagem
      const valorTotal = (item.qty * item.unit_price).toFixed(2);
      let mensagem = template.content
        .replace(/\{\{produto\}\}/g, `${item.product.name} (${item.product.code})`)
        .replace(/\{\{quantidade\}\}/g, item.qty.toString())
        .replace(/\{\{valor\}\}/g, valorTotal);

      // Normalizar telefone
      const phoneClean = item.cart.customer_phone.replace(/\D/g, '');
      const phoneFinal = phoneClean.startsWith('55') ? phoneClean : `55${phoneClean}`;
      const phoneFormatted = `${phoneFinal}@s.whatsapp.net`;

      // Enviar mensagem
      console.log(`📤 Enviando WhatsApp para ${phoneFinal}...`);
      await sock.sendMessage(phoneFormatted, { text: mensagem });
      console.log(`✅ Mensagem enviada!`);

      // Logar no banco
      await this.supabaseHelper.logMessage(
        tenantId,
        phoneFinal,
        mensagem,
        'item_added'
      );

      // Marcar como processado
      await this.supabaseHelper.markCartItemProcessed(item.id);
      console.log(`✅ Item marcado como processado\n`);

    } catch (error) {
      console.error(`❌ Erro ao processar item:`, error.message);
    }
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Monitor de carrinho parado');
  }
}

function normalizePhone(phone) {
  let clean = phone.replace(/\D/g, '');
  if (!clean.startsWith('55')) {
    clean = '55' + clean;
  }
  const ddd = parseInt(clean.substring(2, 4));
  if (ddd >= 31) {
    if (clean.length === 13 && clean[4] === '9') {
      clean = clean.slice(0, 4) + clean.slice(5);
    }
  } else {
    if (clean.length === 12 && clean[4] !== '9') {
      clean = clean.slice(0, 4) + '9' + clean.slice(4);
    }
  }
  return clean + '@s.whatsapp.net';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createApp(tenantManager, supabaseHelper) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
    req.tenantId = tenantId;
    next();
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/status', (req, res) => {
    const status = tenantManager.getAllStatus();
    res.json({ 
      success: true, 
      tenants: status,
      timestamp: new Date().toISOString()
    });
  });

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

    if (clientData.status === 'online' && clientData.sock) {
      try {
        const me = clientData.sock.user;
        if (me) {
          status.whatsapp_info = {
            id: me.id,
            name: me.name,
            phone: me.id.split(':')[0]
          };
        }
      } catch (error) {
        status.whatsapp_info_error = error.message;
      }
    }
    
    res.json(status);
  });

  app.get('/list-all-groups', async (req, res) => {
    const { tenantId } = req;

    if (!tenantId) {
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id obrigatório' 
      });
    }

    const sock = tenantManager.getOnlineClient(tenantId);
    if (!sock) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado para este tenant' 
      });
    }

    try {
      const chats = await sock.groupFetchAllParticipating();
      const groups = Object.values(chats).map(group => ({
        id: group.id,
        name: group.subject,
        participantCount: group.participants?.length || 0
      }));

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
                clientData.status === 'connecting' ? '🔄 Conectando...' :
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

  app.post('/send-group', async (req, res) => {
    const { tenantId } = req;
    const { groupId, message } = req.body;

    if (!tenantId || !groupId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id, groupId e message são obrigatórios' 
      });
    }

    const sock = tenantManager.getOnlineClient(tenantId);
    if (!sock) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado' 
      });
    }

    try {
      await sock.sendMessage(groupId, { text: message });
      
      await supabaseHelper.logMessage(
        tenantId,
        groupId,
        message,
        'sendflow',
        { whatsapp_group_name: groupId }
      );

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

  app.post('/send', async (req, res) => {
    const { tenantId } = req;
    const { phone, message } = req.body;

    if (!tenantId || !phone || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id, phone e message são obrigatórios' 
      });
    }

    const sock = tenantManager.getOnlineClient(tenantId);
    if (!sock) {
      const clientData = tenantManager.clients.get(tenantId);
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado',
        status: clientData?.status || 'não inicializado'
      });
    }

    try {
      const normalizedPhone = normalizePhone(phone);
      
      const sendStart = Date.now();
      await sock.sendMessage(normalizedPhone, { text: message });
      const sendDuration = Date.now() - sendStart;
      
      await supabaseHelper.logMessage(tenantId, phone, message, 'individual');

      res.json({ 
        success: true, 
        message: 'Mensagem enviada com sucesso',
        phone: normalizedPhone,
        duration_ms: sendDuration
      });
    } catch (error) {
      console.error('❌ Erro ao enviar:', error);
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
let cartMonitor = null;

process.on('uncaughtException', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rejeitada:', reason);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  
  if (cartMonitor) {
    cartMonitor.stop();
  }
  
  for (const [tenantId, data] of tenantManager.clients.entries()) {
    try {
      if (data.sock) {
        await data.sock.logout();
      }
    } catch (error) {
      console.log(`⚠️ Erro ao encerrar:`, error.message);
    }
  }
  console.log('✅ Servidor encerrado');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Encerrando servidor (SIGTERM)...');
  
  if (cartMonitor) {
    cartMonitor.stop();
  }
  
  for (const [tenantId, data] of tenantManager.clients.entries()) {
    try {
      if (data.sock) {
        await data.sock.logout();
      }
    } catch (error) {
      console.log(`⚠️ Erro:`, error.message);
    }
  }
  process.exit(0);
});

// ==================== INICIALIZAÇÃO ====================
async function main() {
  console.log('🚀 Iniciando servidor WhatsApp Multi-Tenant com Baileys...\n');
  console.log('💡 MODO LOCALHOST: Monitor de carrinho ativo\n');

  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY não configurada!');
    process.exit(1);
  }

  const supabaseHelper = new SupabaseHelper(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const allTenants = await supabaseHelper.loadActiveTenants();
  let tenants = allTenants;

  if (TENANT_FILTER) {
    const requestedTenantIds = TENANT_FILTER.split(',').map((id) => id.trim()).filter(Boolean);
    tenants = allTenants.filter((tenant) => requestedTenantIds.includes(tenant.id));

    if (tenants.length === 0) {
      console.error('[TENANT] Nenhum tenant encontrado para os IDs configurados:', requestedTenantIds.join(', '));
      process.exit(1);
    }

    console.log(`[TENANT] Tenants filtrados: ${requestedTenantIds.join(', ')}`);
  } else {
    console.log('[TENANT] Nenhum TENANT_ID definido. Carregando todos os tenants ativos.');
  }

  for (const tenant of tenants) {
    try {
      await tenantManager.createClient(tenant);
      await delay(2000);
    } catch (error) {
      console.error(`❌ Erro ao criar cliente:`, error);
    }
  }

  // Criar e iniciar servidor Express
  const app = createApp(tenantManager, supabaseHelper);
  
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`🌐 Health: ${NORMALIZED_PUBLIC_BASE_URL}/health`);
    console.log(`📊 Status: ${NORMALIZED_PUBLIC_BASE_URL}/status`);
    console.log(`${'='.repeat(70)}\n`);
  });

  // NOVO: Iniciar monitor de carrinho após 5 segundos
  setTimeout(() => {
    cartMonitor = new CartMonitor(tenantManager, supabaseHelper);
    cartMonitor.start();
  }, 5000);
}

main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
