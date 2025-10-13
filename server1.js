const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const P = require('pino');

// ==================== CONFIGURAÇÃO ====================
const PORT = process.env.PORT || 3333;
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';

// Diretório de autenticação
const AUTH_DIR = path.join(__dirname, '.baileys_auth');

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
        console.log(`🌐 Acesse no navegador: http://localhost:3333/qr/${tenantId}`);
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
          // 401 - Usuário fez logout, limpar sessão
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
          // 515 - WhatsApp pediu restart, reconectar imediatamente
          console.log(`🔄 RESTART NECESSÁRIO (515) - reconectando em 2s...`);
          this.clients.delete(tenantId);
          setTimeout(() => this.createClient(tenant), 2000);
          
        } else if (statusCode === DisconnectReason.timedOut) {
          // 408 - Timeout, reconectar
          console.log(`⏱️ TIMEOUT (408) - reconectando em 5s...`);
          setTimeout(() => this.createClient(tenant), 5000);
          
        } else if (statusCode === DisconnectReason.connectionClosed) {
          // 428 - Conexão fechada, reconectar
          console.log(`🔌 CONEXÃO FECHADA (428) - reconectando em 3s...`);
          setTimeout(() => this.createClient(tenant), 3000);
          
        } else if (statusCode === DisconnectReason.connectionReplaced) {
          // 440 - Outra conexão substituiu essa, não reconectar
          console.log(`🔄 CONEXÃO SUBSTITUÍDA (440) - não reconectando`);
          this.clients.delete(tenantId);
          
        } else if (statusCode === DisconnectReason.badSession) {
          // 500 - Sessão inválida, limpar e gerar novo QR
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
          // 411 - Mismatch de multi-device, limpar sessão
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
          // Outros erros - tentar reconectar
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
    if (!clientData) return;

    const tenant = clientData.tenant;
    
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
    const customerPhone = msg.key.remoteJid.split('@')[0];
    
    // Verificar se é mensagem de grupo
    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    const groupName = isGroup ? msg.key.remoteJid : null;

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
    if (clean.length === 13 && clean[4] === '9') {
      clean = clean.slice(0, 4) + clean.slice(5);
      console.log(`📱 DDD ${ddd} >= 31: removido 9º dígito → ${clean}`);
    }
  } else {
    if (clean.length === 12 && clean[4] !== '9') {
      clean = clean.slice(0, 4) + '9' + clean.slice(4);
      console.log(`📱 DDD ${ddd} < 31: adicionado 9º dígito → ${clean}`);
    }
  }
  
  return clean + '@s.whatsapp.net';
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

    const sock = tenantManager.getOnlineClient(tenantId);
    if (!sock) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado para este tenant' 
      });
    }

    try {
      // Buscar todos os chats
      const chats = await sock.groupFetchAllParticipating();
      const groups = Object.values(chats).map(group => ({
        id: group.id,
        name: group.subject,
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

    // Gerar QR Code como imagem
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

    const sock = tenantManager.getOnlineClient(tenantId);
    if (!sock) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não conectado' 
      });
    }

    try {
      console.log(`📤 Enviando mensagem para grupo ${groupId}`);
      
      await sock.sendMessage(groupId, { text: message });
      
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
    
    const sock = tenantManager.getOnlineClient(tenantId);
    if (!sock) {
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
      } else if (clientData?.status === 'connecting') {
        errorMessage = 'WhatsApp conectando, aguarde...';
        instructions = '\n\n⏳ Aguarde alguns segundos...';
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
      console.log(`⏳ Enviando mensagem via Baileys...`);
      
      const sendStart = Date.now();
      await sock.sendMessage(normalizedPhone, { text: message });
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

process.on('uncaughtException', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  for (const [tenantId, data] of tenantManager.clients.entries()) {
    try {
      console.log(`🔄 Encerrando ${data.tenant.name}...`);
      if (data.sock) {
        await data.sock.logout();
      }
    } catch (error) {
      console.log(`⚠️ Erro ao encerrar ${data.tenant.name}:`, error.message);
    }
  }
  console.log('✅ Servidor encerrado');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Encerrando servidor (SIGTERM)...');
  for (const [tenantId, data] of tenantManager.clients.entries()) {
    try {
      if (data.sock) {
        await data.sock.logout();
      }
    } catch (error) {
      console.log(`⚠️ Erro ao encerrar ${data.tenant.name}:`, error.message);
    }
  }
  process.exit(0);
});

// ==================== INICIALIZAÇÃO ====================
async function main() {
  console.log('🚀 Iniciando servidor WhatsApp Multi-Tenant com Baileys...\n');

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
    console.error('❌ Tenant MANIA DE MULHER não encontrado no banco!');
    process.exit(1);
  }

  console.log(`✅ ${tenants.length} tenant(s) carregado(s)`);

  // Criar clientes para todos os tenants
  for (const tenant of tenants) {
    try {
      await tenantManager.createClient(tenant);
      console.log(`✅ Cliente criado para ${tenant.name}`);
      await delay(2000); // Delay entre inicializações
    } catch (error) {
      console.error(`❌ Erro ao criar cliente para ${tenant.name}:`, error);
    }
  }

  // Criar e iniciar servidor Express
  const app = createApp(tenantManager, supabaseHelper);
  
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORT}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`🌐 Health Check: http://localhost:${PORT}/health`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`${'='.repeat(70)}\n`);
  });
}

// Iniciar
main().catch(error => {
  console.error('❌ Erro fatal ao iniciar servidor:', error);
  process.exit(1);
});
