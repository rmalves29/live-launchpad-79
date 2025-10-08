// ===== SERVIDOR WHATSAPP PARA LOVABLE - INSTÂNCIA ÚNICA =====
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(cors());

// ============= CONFIGURAÇÕES =============
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || 3333;

// Configurações de rate limit
const RATE_LIMIT = {
  delayBetweenMessages: 4000, // 4 segundos entre mensagens
  cooldownAfterBatch: 30000, // 30 segundos após cada 10 mensagens
  maxRetries: 2
};

// ============= ESTADO DA INSTÂNCIA =============
let client = null;
let clientStatus = 'offline';
let clientNumber = null;
const logs = [];
const messageStatus = [];
let lastSentTime = 0;

// ============= UTILITÁRIOS =============
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePhoneBR(phone) {
  const clean = phone.replace(/\D/g, '');
  let formatted = clean;
  
  // Adiciona código do país se não tiver
  if (!formatted.startsWith('55')) {
    formatted = '55' + formatted;
  }
  
  // Adiciona 9º dígito se necessário (celulares)
  if (formatted.length === 12) {
    const ddd = formatted.substring(2, 4);
    const num = formatted.substring(4);
    if (!num.startsWith('9')) {
      formatted = '55' + ddd + '9' + num;
    }
  }
  
  return formatted + '@c.us';
}

function addLog(type, message, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    message,
    ...details
  };
  
  logs.unshift(logEntry);
  
  // Manter apenas últimos 500 logs
  if (logs.length > 500) {
    logs.splice(500);
  }
  
  console.log(`[${type.toUpperCase()}] ${message}`, details);
}

// ============= WEBHOOK PARA SUPABASE =============
async function sendWebhookToSupabase(data) {
  if (!SUPABASE_SERVICE_KEY) {
    console.log('⚠️ SUPABASE_SERVICE_ROLE_KEY não configurada, webhook ignorado');
    return;
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/webhook-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      console.log('✅ Webhook enviado para Supabase');
    } else {
      console.log('⚠️ Erro ao enviar webhook:', response.status);
    }
  } catch (error) {
    console.log('⚠️ Erro ao enviar webhook:', error.message);
  }
}

// ============= ENVIO DE MENSAGENS =============
async function sendMessageWithThrottling(phone, message, options = {}) {
  if (!client || clientStatus !== 'online') {
    throw new Error('Cliente WhatsApp não está online');
  }
  
  // Verificar estado da conexão
  const state = await client.getState();
  if (state !== 'CONNECTED') {
    throw new Error(`Cliente não conectado. Estado: ${state}`);
  }
  
  // Throttling
  const now = Date.now();
  const timeSinceLastSent = now - lastSentTime;
  
  if (timeSinceLastSent < RATE_LIMIT.delayBetweenMessages) {
    const waitTime = RATE_LIMIT.delayBetweenMessages - timeSinceLastSent;
    console.log(`⏱️ Aguardando ${waitTime}ms para respeitar rate limit`);
    await delay(waitTime);
  }
  
  const phoneFormatted = normalizePhoneBR(phone);
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`📤 Enviando mensagem para ${phone}...`);
    
    if (options.media) {
      // Enviar com mídia
      await client.sendMessage(phoneFormatted, options.media, { caption: message });
    } else {
      // Enviar apenas texto
      await client.sendMessage(phoneFormatted, message);
    }
    
    lastSentTime = Date.now();
    
    addLog('success', `Mensagem enviada para ${phone}`, { phone, messageId });
    
    messageStatus.push({
      messageId,
      phone,
      status: 'sent',
      timestamp: new Date().toISOString()
    });
    
    if (messageStatus.length > 500) {
      messageStatus.splice(500);
    }
    
    // Enviar webhook para Supabase
    await sendWebhookToSupabase({
      type: 'message_sent',
      phone: phone,
      message: message.substring(0, 100),
      messageId,
      timestamp: new Date().toISOString()
    });
    
    return { success: true, messageId, phone };
    
  } catch (error) {
    addLog('error', `Erro ao enviar para ${phone}: ${error.message}`, { phone, error: error.message });
    
    // Detectar rate limit
    if (error.message.includes('rate') || error.message.includes('limit') || error.message.includes('429')) {
      console.log('🚨 RATE LIMIT detectado - aguardando 60 segundos');
      await delay(60000);
    }
    
    throw error;
  }
}

// ============= CRIAR CLIENTE =============
function createWhatsAppClient() {
  console.log('🆕 Criando cliente WhatsApp...');
  
  const newClient = new Client({
    authStrategy: new LocalAuth({
      clientId: 'lovable-whatsapp',
      dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer'
      ]
    },
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
  });
  
  // ============= EVENTOS =============
  newClient.on('qr', (qr) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('📱 QR CODE - LOVABLE WHATSAPP');
    console.log('='.repeat(60));
    qrcode.generate(qr, { small: true });
    console.log('='.repeat(60));
    console.log('✅ Escaneie o QR code acima no WhatsApp do celular');
    console.log('='.repeat(60) + '\n');
    
    clientStatus = 'qr_code';
    addLog('info', 'QR Code gerado');
  });
  
  newClient.on('loading_screen', (percent) => {
    console.log(`⏳ Carregando: ${percent}%`);
  });
  
  newClient.on('authenticated', () => {
    console.log('🔐 Autenticado');
    clientStatus = 'authenticated';
    addLog('info', 'Cliente autenticado');
  });
  
  newClient.on('ready', () => {
    console.log('✅ Cliente WhatsApp pronto!');
    clientStatus = 'online';
    
    if (newClient.info?.wid?.user) {
      clientNumber = newClient.info.wid.user;
      console.log(`📱 Número: +${clientNumber}`);
      addLog('info', `Cliente pronto - Número: +${clientNumber}`);
    }
  });
  
  newClient.on('auth_failure', (msg) => {
    console.error(`❌ Falha na autenticação: ${msg}`);
    clientStatus = 'auth_failure';
    addLog('error', `Falha na autenticação: ${msg}`);
  });
  
  newClient.on('disconnected', (reason) => {
    console.log(`⚠️ Desconectado: ${reason}`);
    clientStatus = 'disconnected';
    clientNumber = null;
    addLog('warning', `Cliente desconectado: ${reason}`);
    
    // Se for LOGOUT, NÃO reconectar automaticamente
    if (reason === 'LOGOUT') {
      console.log('\n' + '='.repeat(60));
      console.log('❌ LOGOUT DETECTADO - Sessão removida pelo WhatsApp');
      console.log('='.repeat(60));
      console.log('📋 Possíveis causas:');
      console.log('   1. Múltiplas conexões no mesmo número');
      console.log('   2. QR code escaneado em outro servidor');
      console.log('   3. Sessão expirada ou inválida');
      console.log('');
      console.log('🔧 Para corrigir:');
      console.log('   1. Pare o servidor (Ctrl+C)');
      console.log('   2. Execute: .\\fix-lockfile.ps1');
      console.log('   3. Reinicie: node whatsapp-server-single.js');
      console.log('='.repeat(60) + '\n');
      
      addLog('error', 'LOGOUT detectado - Reconexão automática desabilitada');
      return;
    }
    
    // Para outros tipos de desconexão, tentar reconectar
    console.log('🔄 Tentando reconectar em 30 segundos...');
    setTimeout(() => {
      console.log('🔄 Iniciando reconexão...');
      newClient.initialize().catch(err => {
        console.error('❌ Erro na reconexão:', err.message);
        addLog('error', `Erro na reconexão: ${err.message}`);
      });
    }, 30000);
  });
  
  newClient.on('message', async (msg) => {
    try {
      if (!msg.fromMe) {
        const contact = await msg.getContact();
        const phone = contact.number;
        const message = msg.body;
        
        console.log(`📨 Mensagem recebida de ${phone}: ${message}`);
        
        // Enviar webhook para Supabase
        await sendWebhookToSupabase({
          type: 'message_received',
          phone: phone,
          message: message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem recebida:', error.message);
    }
  });
  
  return newClient;
}

// ============= ENDPOINTS DA API =============

// Status do servidor
app.get('/status', (req, res) => {
  res.json({
    status: clientStatus,
    number: clientNumber,
    online: clientStatus === 'online',
    timestamp: new Date().toISOString()
  });
});

// Logs
app.get('/logs', (req, res) => {
  res.json({
    logs: logs.slice(0, 100),
    total: logs.length
  });
});

// Status de mensagens
app.get('/message-status', (req, res) => {
  res.json({
    messages: messageStatus.slice(0, 100),
    total: messageStatus.length
  });
});

// Enviar mensagem simples
app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'phone e message são obrigatórios'
      });
    }
    
    const result = await sendMessageWithThrottling(phone, message);
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('❌ Erro no envio:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Broadcast para múltiplos números
app.post('/broadcast', async (req, res) => {
  try {
    const { phones, message } = req.body;
    
    if (!Array.isArray(phones) || !message) {
      return res.status(400).json({
        success: false,
        error: 'phones (array) e message são obrigatórios'
      });
    }
    
    // Responder imediatamente
    res.json({
      success: true,
      message: `Enviando para ${phones.length} números`,
      total: phones.length
    });
    
    // Processar em background
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < phones.length; i++) {
      try {
        await sendMessageWithThrottling(phones[i], message);
        successCount++;
        
        // Cooldown a cada 10 mensagens
        if ((i + 1) % 10 === 0 && i < phones.length - 1) {
          console.log('🛑 Cooldown de 30 segundos...');
          await delay(RATE_LIMIT.cooldownAfterBatch);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Erro ao enviar para ${phones[i]}:`, error.message);
      }
    }
    
    console.log(`\n✅ Broadcast concluído: ${successCount}/${phones.length} enviados`);
    addLog('info', `Broadcast concluído: ${successCount}/${phones.length}`, { successCount, errorCount, total: phones.length });
    
  } catch (error) {
    console.error('❌ Erro no broadcast:', error);
  }
});

// Enviar mensagem de produto cancelado (compatível com o sistema)
app.post('/send-product-canceled', async (req, res) => {
  try {
    const { phone, productName, productCode } = req.body;
    
    if (!phone || !productName || !productCode) {
      return res.status(400).json({
        success: false,
        error: 'phone, productName e productCode são obrigatórios'
      });
    }
    
    const message = `❌ *Produto Cancelado*\n\nO produto "${productName}" (código: ${productCode}) foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.`;
    
    const result = await sendMessageWithThrottling(phone, message);
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('❌ Erro no envio:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    whatsapp: clientStatus,
    uptime: process.uptime()
  });
});

// ============= INICIALIZAÇÃO =============
console.log('\n' + '='.repeat(60));
console.log('🚀 SERVIDOR WHATSAPP LOVABLE');
console.log('='.repeat(60));
console.log(`🌐 URL: http://localhost:${PORT}`);
console.log(`📊 Status: http://localhost:${PORT}/status`);
console.log(`📋 Logs: http://localhost:${PORT}/logs`);
console.log('='.repeat(60) + '\n');

// Criar e inicializar cliente
client = createWhatsAppClient();
client.initialize().catch(err => {
  console.error('❌ Erro na inicialização:', err.message);
  clientStatus = 'error';
  addLog('error', `Erro na inicialização: ${err.message}`);
});

// Iniciar servidor Express
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}\n`);
  addLog('info', `Servidor iniciado na porta ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️ Encerrando servidor...');
  if (client) {
    try {
      await client.destroy();
      console.log('✅ Cliente desconectado');
    } catch (error) {
      console.log('⚠️ Erro ao desconectar cliente');
    }
  }
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  addLog('error', `Uncaught exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection:', reason);
  addLog('error', `Unhandled rejection: ${reason}`);
});
