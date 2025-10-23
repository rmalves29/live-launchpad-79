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
let AUTH_DIR = process.env.AUTH_DIR
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
console.log(`📁 Verificando diretório de autenticação: ${AUTH_DIR}`);
if (!fs.existsSync(AUTH_DIR)) {
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    console.log(`✅ Diretório de autenticação criado: ${AUTH_DIR}`);
  } catch (error) {
    console.error(`❌ Erro ao criar diretório ${AUTH_DIR}:`, error.message);
    console.error(`   Tentando usar diretório temporário...`);
    AUTH_DIR = path.join('/tmp', '.baileys_auth');
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    console.log(`✅ Usando diretório temporário: ${AUTH_DIR}`);
  }
} else {
  console.log(`✅ Diretório de autenticação já existe: ${AUTH_DIR}`);
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
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📱 INICIANDO CLIENTE BAILEYS`);
    console.log(`Tenant: ${tenant.name}`);
    console.log(`ID: ${tenantId}`);
    console.log(`${'='.repeat(70)}`);

    // Diretório de autenticação do tenant
    const authPath = path.join(AUTH_DIR, `session-${tenantId}`);
    console.log(`📁 Auth path: ${authPath}`);
    
    try {
      if (!fs.existsSync(authPath)) {
        console.log(`📁 Criando diretório de sessão...`);
        fs.mkdirSync(authPath, { recursive: true });
        console.log(`✅ Diretório criado`);
      } else {
        console.log(`✅ Diretório já existe`);
      }

      // Estado de autenticação
      console.log(`🔑 Carregando estado de autenticação...`);
      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      console.log(`✅ Estado de autenticação carregado`);
      
      // Buscar versão mais recente do Baileys
      console.log(`🔍 Buscando versão do Baileys...`);
      const { version } = await fetchLatestBaileysVersion();
      console.log(`✅ Versão do Baileys: ${version.join('.')}`);

      // Status inicial
      console.log(`📊 Registrando cliente com status 'initializing'...`);
      this.clients.set(tenantId, {
        sock: null,
        status: 'initializing',
        qr: null,
        tenant,
        authState: { state, saveCreds }
      });
      console.log(`✅ Cliente registrado`);

      // Criar socket do WhatsApp
      console.log(`🔌 Criando socket do WhatsApp...`);
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
      console.log(`✅ Socket criado com sucesso`);
      console.log(`${'='.repeat(70)}\n`);

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

    } catch (error) {
      console.error(`❌ ERRO AO INICIALIZAR CLIENTE:`);
      console.error(`   Tipo: ${error.name}`);
      console.error(`   Mensagem: ${error.message}`);
      console.error(`   Stack:`, error.stack);
      console.log(`${'='.repeat(70)}\n`);
      throw error;
    }
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
    
    console.log(`\n🔍 ===== DEBUG DE IDENTIFICAÇÃO DO CLIENTE =====`);
    console.log(`📋 RemoteJid completo: ${msg.key.remoteJid}`);
    console.log(`📋 Participant: ${msg.key.participant || 'N/A'}`);
    console.log(`📋 É grupo? ${isGroup ? 'SIM' : 'NÃO'}`);
    
    if (isGroup && msg.key.participant) {
      // MENSAGEM DE GRUPO: usar participant (quem enviou a mensagem)
      customerPhone = msg.key.participant.split('@')[0];
      console.log(`\n✅ GRUPO DETECTADO`);
      console.log(`📊 Nome do grupo: ${groupName}`);
      console.log(`👤 Telefone do participante (quem comentou): ${customerPhone}`);
    } else if (isGroup && !msg.key.participant) {
      // MENSAGEM DE GRUPO SEM PARTICIPANT (caso raro)
      console.log(`\n⚠️ AVISO: Mensagem de grupo SEM participant - usando remoteJid`);
      customerPhone = msg.key.remoteJid.split('@')[0];
      console.log(`👤 Telefone (fallback): ${customerPhone}`);
    } else {
      // MENSAGEM INDIVIDUAL: usar remoteJid
      customerPhone = msg.key.remoteJid.split('@')[0];
      console.log(`\n✅ MENSAGEM INDIVIDUAL`);
      console.log(`👤 Telefone do cliente: ${customerPhone}`);
    }
    
    console.log(`\n🔑 TELEFONE FINAL IDENTIFICADO: ${customerPhone}`);
    console.log(`===== FIM DEBUG DE IDENTIFICAÇÃO =====\n`);

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
    
    // Verificar se o socket realmente tem sessão ativa e conexão WebSocket aberta
    const sock = clientData.sock;
    if (!sock || !sock.user || !sock.authState || !sock.authState.creds) {
      console.log(`⚠️ Cliente ${tenantId} marcado como online mas sem sessão válida`);
      clientData.status = 'disconnected';
      return null;
    }
    
    // Verificar se WebSocket está realmente conectado
    if (sock.ws && sock.ws.readyState !== 1) { // 1 = OPEN
      console.log(`⚠️ Cliente ${tenantId} com sessão mas WebSocket não está aberto (readyState: ${sock.ws.readyState})`);
      clientData.status = 'disconnected';
      return null;
    }
    
    return sock;
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

  async resetClient(tenantId) {
    console.log(`\n🔄 FORÇANDO RESET DO CLIENTE: ${tenantId}`);
    
    const clientData = this.clients.get(tenantId);
    if (!clientData) {
      console.log('⚠️ Cliente não existe');
      return false;
    }

    const tenant = clientData.tenant;
    const authPath = path.join(AUTH_DIR, `session-${tenantId}`);

    try {
      // Fechar conexão se existir
      if (clientData.sock) {
        try {
          await clientData.sock.logout();
          console.log('✅ Logout executado');
        } catch (error) {
          console.log('⚠️ Erro no logout:', error.message);
        }
      }

      // Remover da lista
      this.clients.delete(tenantId);
      console.log('✅ Cliente removido da lista');

      // Limpar sessão do disco
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('✅ Sessão removida do disco');
      }

      // Aguardar 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Criar novo cliente
      console.log('🔄 Criando novo cliente...');
      await this.createClient(tenant);
      console.log('✅ Reset concluído!\n');

      return true;
    } catch (error) {
      console.error('❌ Erro ao resetar cliente:', error);
      return false;
    }
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

    // VALIDAÇÃO REAL DA SESSÃO - não confiar apenas na variável status
    let realStatus = clientData.status;
    const sock = clientData.sock;
    
    // Se diz que está online, validar se realmente tem sessão válida
    if (realStatus === 'online' && sock) {
      const hasValidSession = !!(
        sock.user && 
        sock.authState && 
        sock.authState.creds &&
        sock.ws &&
        sock.ws.readyState === 1 // WebSocket OPEN
      );
      
      if (!hasValidSession) {
        console.log(`⚠️ [${tenantId}] Status estava 'online' mas sessão inválida. Atualizando para 'disconnected'`);
        realStatus = 'disconnected';
        clientData.status = 'disconnected';
      }
    }

    const status = {
      success: true,
      tenant_id: tenantId,
      tenant_name: clientData.tenant.name,
      status: realStatus,
      qr_available: !!clientData.qr,
      timestamp: new Date().toISOString()
    };

    if (realStatus === 'online' && sock && sock.user) {
      try {
        status.whatsapp_info = {
          id: sock.user.id,
          name: sock.user.name,
          phone: sock.user.id.split(':')[0]
        };
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

  // NOVO: Endpoint para forçar reset e gerar novo QR
  app.post('/reset/:tenantId', async (req, res) => {
    const { tenantId } = req.params;
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔄 REQUISIÇÃO DE RESET RECEBIDA`);
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`${'='.repeat(70)}\n`);
    
    const success = await tenantManager.resetClient(tenantId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Cliente resetado com sucesso. Aguarde alguns segundos para o QR Code ser gerado.' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao resetar cliente' 
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

    console.log(`\n${'='.repeat(70)}`);
    console.log(`📤 SENDFLOW - ENVIO PARA GRUPO`);
    console.log(`${'='.repeat(70)}`);
    console.log(`🏢 Tenant ID: ${tenantId}`);
    console.log(`👥 Group ID: ${groupId}`);
    console.log(`💬 Mensagem (${message?.length || 0} chars): ${message?.substring(0, 100) || 'N/A'}...`);

    if (!tenantId || !groupId || !message) {
      console.log(`❌ Parâmetros faltando!`);
      console.log(`   tenantId: ${tenantId ? '✅' : '❌'}`);
      console.log(`   groupId: ${groupId ? '✅' : '❌'}`);
      console.log(`   message: ${message ? '✅' : '❌'}`);
      console.log(`${'='.repeat(70)}\n`);
      
      return res.status(400).json({ 
        success: false, 
        error: 'tenant_id, groupId e message são obrigatórios',
        details: {
          tenant_id: !!tenantId,
          groupId: !!groupId,
          message: !!message
        }
      });
    }

    const sock = tenantManager.getOnlineClient(tenantId);
    if (!sock) {
      const clientData = tenantManager.clients.get(tenantId);
      const currentStatus = clientData?.status || 'não inicializado';
      
      console.log(`❌ WhatsApp NÃO CONECTADO para tenant ${tenantId}`);
      console.log(`   Status atual: ${currentStatus}`);
      console.log(`${'='.repeat(70)}\n`);
      
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado',
        status: currentStatus,
        details: 'Conecte o WhatsApp antes de enviar mensagens'
      });
    }
    
    // VALIDAÇÃO CRÍTICA: verificar se sessão realmente existe ANTES de tentar enviar
    if (!sock.user || !sock.authState || !sock.authState.creds) {
      const clientData = tenantManager.clients.get(tenantId);
      const currentStatus = clientData?.status || 'unknown';
      
      console.log(`❌ SESSÃO WHATSAPP INVÁLIDA para tenant ${tenantId}`);
      console.log(`   sock.user: ${sock.user ? '✅' : '❌'}`);
      console.log(`   sock.authState: ${sock.authState ? '✅' : '❌'}`);
      console.log(`   sock.authState.creds: ${sock.authState?.creds ? '✅' : '❌'}`);
      console.log(`${'='.repeat(70)}\n`);
      
      // Atualizar status
      if (clientData) {
        clientData.status = 'disconnected';
      }
      
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp desconectado',
        status: 'disconnected',
        details: 'Sessão perdida. Vá até "Conexão WhatsApp" e escaneie o QR Code novamente.'
      });
    }

    console.log(`✅ WhatsApp conectado com sessão válida, enviando mensagem...`);

    try {
      const startTime = Date.now();
      
      // Validar formato do groupId
      if (!groupId.includes('@g.us')) {
        throw new Error(`Formato de ID de grupo inválido: ${groupId}. Esperado: xxxxx@g.us`);
      }
      
      await sock.sendMessage(groupId, { text: message });
      
      const duration = Date.now() - startTime;
      console.log(`✅ Mensagem enviada com sucesso! (${duration}ms)`);
      
      await supabaseHelper.logMessage(
        tenantId,
        groupId,
        message,
        'sendflow',
        { whatsapp_group_name: groupId }
      );

      console.log(`✅ Mensagem registrada no banco`);
      console.log(`${'='.repeat(70)}\n`);

      res.json({ 
        success: true, 
        message: 'Mensagem enviada com sucesso',
        duration_ms: duration
      });
    } catch (error) {
      console.error(`❌ ERRO AO ENVIAR MENSAGEM:`);
      console.error(`   Tipo: ${error.name}`);
      console.error(`   Mensagem: ${error.message}`);
      
      // Identificar tipo de erro específico do Baileys
      let errorType = 'unknown';
      let errorMessage = error.message;
      let statusCode = 500;
      
      // Erro de sessão perdida - CRÍTICO
      if (error.message.includes('No sessions') || error.message.includes('session') || error.message.includes('Connection Closed')) {
        errorType = 'no-session';
        errorMessage = 'WhatsApp desconectado. Escaneie o QR Code novamente na página de Conexão.';
        statusCode = 503;
        
        // Atualizar status do cliente
        const clientData = tenantManager.clients.get(tenantId);
        if (clientData) {
          clientData.status = 'disconnected';
          console.log(`🔄 Status atualizado para 'disconnected'`);
        }
      } else if (error.message.includes('timed out') || error.message.includes('timeout')) {
        errorType = 'timeout';
        errorMessage = 'Timeout ao enviar mensagem. O WhatsApp pode estar lento.';
      } else if (error.message.includes('not-authorized') || error.message.includes('401')) {
        errorType = 'not-authorized';
        errorMessage = 'Sem autorização para enviar neste grupo. Verifique se o bot está no grupo.';
      } else if (error.message.includes('rate-limit') || error.message.includes('429')) {
        errorType = 'rate-limit';
        errorMessage = 'Limite de mensagens atingido. Aguarde alguns minutos.';
      } else if (error.message.includes('invalid') || error.message.includes('not found')) {
        errorType = 'invalid-group';
        errorMessage = 'Grupo não encontrado ou ID inválido.';
      }
      
      console.error(`   Tipo identificado: ${errorType}`);
      console.error(`   Stack:`, error.stack);
      console.log(`${'='.repeat(70)}\n`);
      
      res.status(statusCode).json({ 
        success: false, 
        error: errorMessage,
        error_type: errorType,
        details: error.message
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
