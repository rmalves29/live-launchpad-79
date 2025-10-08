// VERSÃO CORRIGIDA - Sistema anti-desconexão
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

// ============= CONFIGURAÇÕES ANTI-DESCONEXÃO =============
const RATE_LIMIT = {
  messagesPerMinute: 15, // Limite seguro por minuto
  delayBetweenMessages: 4000, // 4 segundos entre mensagens
  cooldownAfterBatch: 30000, // 30 segundos após cada lote
  maxRetries: 2
};

const instanceNames = ['instancia1', 'instancia2', 'instancia3'];
const clients = {};
const instanceStatus = {};
const instanceNumbers = {};
const logs = [];
const messageQueue = new Map(); // Fila por instância
const lastSentTime = new Map(); // Controle de tempo por instância

// Função de delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Normalizar número brasileiro
function normalizeNumber(numero) {
  const clean = numero.replace(/\D/g, '');
  // Adiciona 55 se não tiver
  const withCountry = clean.startsWith('55') ? clean : `55${clean}`;
  // Adiciona 9º dígito se necessário
  if (withCountry.length === 12) {
    const ddd = withCountry.substring(2, 4);
    const num = withCountry.substring(4);
    if (!num.startsWith('9')) {
      return `55${ddd}9${num}@c.us`;
    }
  }
  return `${withCountry}@c.us`;
}

// ============= SISTEMA DE THROTTLING INTELIGENTE =============
async function sendWithThrottling(instanceName, client, numero, mensagem) {
  const now = Date.now();
  const lastSent = lastSentTime.get(instanceName) || 0;
  const timeSinceLastSent = now - lastSent;
  
  // Aguardar delay mínimo entre mensagens
  if (timeSinceLastSent < RATE_LIMIT.delayBetweenMessages) {
    const waitTime = RATE_LIMIT.delayBetweenMessages - timeSinceLastSent;
    console.log(`⏱️ ${instanceName}: Aguardando ${waitTime}ms para respeitar rate limit`);
    await delay(waitTime);
  }
  
  // Verificar se não estamos enviando muito rápido
  const queueSize = messageQueue.get(instanceName)?.length || 0;
  if (queueSize > RATE_LIMIT.messagesPerMinute) {
    console.log(`🚨 ${instanceName}: Fila muito grande (${queueSize}), aguardando cooldown`);
    await delay(RATE_LIMIT.cooldownAfterBatch);
  }
  
  const numeroFormatado = normalizeNumber(numero);
  
  try {
    // Verificar se está conectado antes de enviar
    const state = await client.getState();
    if (state !== 'CONNECTED') {
      throw new Error(`Estado: ${state} - Não conectado`);
    }
    
    console.log(`📤 ${instanceName}: Enviando para ${numero}...`);
    await client.sendMessage(numeroFormatado, mensagem);
    
    lastSentTime.set(instanceName, Date.now());
    
    logs.unshift({
      instancia: instanceName,
      numero,
      mensagem: mensagem.substring(0, 50) + '...',
      status: 'enviado',
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ ${instanceName}: Enviado com sucesso para ${numero}`);
    return { success: true, instance: instanceName };
    
  } catch (error) {
    console.error(`❌ ${instanceName}: Erro ao enviar para ${numero}: ${error.message}`);
    
    // Se for erro de rate limit, aguardar mais tempo
    if (error.message.includes('rate') || error.message.includes('limit') || error.message.includes('429')) {
      console.log(`🚨 ${instanceName}: RATE LIMIT detectado - aguardando 60 segundos`);
      await delay(60000);
    }
    
    logs.unshift({
      instancia: instanceName,
      numero,
      mensagem: 'ERRO',
      status: 'erro',
      erro: error.message,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
}

// ============= SISTEMA DE ROTAÇÃO COM FALLBACK =============
let currentInstanceIndex = 0;

function getNextInstance() {
  const availableInstances = instanceNames.filter(name => 
    instanceStatus[name] === 'online' && clients[name]
  );
  
  if (availableInstances.length === 0) {
    return null;
  }
  
  const instance = availableInstances[currentInstanceIndex % availableInstances.length];
  currentInstanceIndex++;
  
  return instance;
}

// ============= ENVIO COM RETRY E ROTAÇÃO =============
async function sendMessageWithRetry(numero, mensagem) {
  let attempts = 0;
  let lastError = null;
  
  while (attempts < RATE_LIMIT.maxRetries) {
    const instanceName = getNextInstance();
    
    if (!instanceName) {
      console.log('❌ Nenhuma instância disponível');
      await delay(5000);
      attempts++;
      continue;
    }
    
    const client = clients[instanceName];
    
    try {
      const result = await sendWithThrottling(instanceName, client, numero, mensagem);
      return result;
    } catch (error) {
      lastError = error;
      attempts++;
      
      console.log(`⚠️ Tentativa ${attempts}/${RATE_LIMIT.maxRetries} falhou para ${numero}`);
      
      if (attempts < RATE_LIMIT.maxRetries) {
        console.log(`🔄 Tentando com outra instância em 3 segundos...`);
        await delay(3000);
      }
    }
  }
  
  throw new Error(`Todas as tentativas falharam: ${lastError?.message}`);
}

// ============= CRIAR E CONFIGURAR CLIENTE =============
function createClient(instanceName) {
  console.log(`🆕 Criando cliente ${instanceName}...`);
  
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: instanceName,
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
  
  // ============= EVENTOS DO CLIENTE =============
  client.on('qr', (qr) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📱 QR CODE - ${instanceName}`);
    console.log(`${'='.repeat(60)}\n`);
    qrcode.generate(qr, { small: true });
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Escaneie o QR code acima no WhatsApp`);
    console.log(`${'='.repeat(60)}\n`);
    instanceStatus[instanceName] = 'qr_code';
  });
  
  client.on('loading_screen', (percent) => {
    console.log(`⏳ ${instanceName}: Carregando ${percent}%`);
  });
  
  client.on('authenticated', () => {
    console.log(`🔐 ${instanceName}: Autenticado`);
    instanceStatus[instanceName] = 'authenticated';
  });
  
  client.on('ready', () => {
    console.log(`✅ ${instanceName}: Pronto`);
    instanceStatus[instanceName] = 'online';
    
    if (client.info?.wid?.user) {
      instanceNumbers[instanceName] = client.info.wid.user;
      console.log(`📱 ${instanceName}: +${client.info.wid.user}`);
    }
  });
  
  client.on('auth_failure', (msg) => {
    console.error(`❌ ${instanceName}: Falha na autenticação - ${msg}`);
    instanceStatus[instanceName] = 'auth_failure';
  });
  
  client.on('disconnected', (reason) => {
    console.log(`⚠️ ${instanceName}: Desconectado - ${reason}`);
    instanceStatus[instanceName] = 'disconnected';
    
    // TENTAR RECONECTAR após 30 segundos
    console.log(`🔄 ${instanceName}: Tentando reconectar em 30 segundos...`);
    setTimeout(() => {
      console.log(`🔄 ${instanceName}: Iniciando reconexão...`);
      client.initialize().catch(err => {
        console.error(`❌ ${instanceName}: Erro na reconexão - ${err.message}`);
      });
    }, 30000);
  });
  
  // Ignorar mensagens recebidas para evitar loops
  client.on('message', async (msg) => {
    if (!msg.fromMe) {
      console.log(`📨 ${instanceName}: Mensagem recebida de ${msg.from}`);
    }
  });
  
  return client;
}

// ============= INICIALIZAR INSTÂNCIAS =============
instanceNames.forEach(name => {
  try {
    const client = createClient(name);
    clients[name] = client;
    instanceStatus[name] = 'initializing';
    messageQueue.set(name, []);
    
    client.initialize().catch(err => {
      console.error(`❌ ${name}: Erro na inicialização - ${err.message}`);
      instanceStatus[name] = 'error';
    });
  } catch (error) {
    console.error(`❌ ${name}: Erro ao criar cliente - ${error.message}`);
    instanceStatus[name] = 'error';
  }
});

// ============= ENDPOINTS DA API =============

app.get('/api/status', (req, res) => {
  const status = instanceNames.map(name => ({
    nome: name,
    status: instanceStatus[name] || 'offline',
    numero: instanceNumbers[name] || null,
    filaSize: messageQueue.get(name)?.length || 0
  }));
  
  res.json({ 
    instancias: status,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/logs', (req, res) => {
  res.json({ 
    logs: logs.slice(0, 100),
    total: logs.length
  });
});

app.post('/api/send', async (req, res) => {
  try {
    const { numero, mensagem } = req.body;
    
    if (!numero || !mensagem) {
      return res.status(400).json({
        success: false,
        error: 'numero e mensagem são obrigatórios'
      });
    }
    
    console.log(`📥 Nova requisição de envio para ${numero}`);
    
    // Enviar de forma assíncrona
    res.json({
      success: true,
      message: 'Mensagem na fila para envio',
      numero: numero
    });
    
    // Processar envio
    try {
      await sendMessageWithRetry(numero, mensagem);
    } catch (error) {
      console.error(`❌ Erro final no envio para ${numero}:`, error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro no endpoint /api/send:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/send-bulk', async (req, res) => {
  try {
    const { numeros, mensagem } = req.body;
    
    if (!Array.isArray(numeros) || !mensagem) {
      return res.status(400).json({
        success: false,
        error: 'numeros (array) e mensagem são obrigatórios'
      });
    }
    
    console.log(`📥 Novo envio em massa para ${numeros.length} números`);
    
    res.json({
      success: true,
      message: `${numeros.length} mensagens na fila`,
      total: numeros.length
    });
    
    // Processar em background
    let sucessos = 0;
    let erros = 0;
    
    for (let i = 0; i < numeros.length; i++) {
      try {
        console.log(`📊 Processando ${i + 1}/${numeros.length}: ${numeros[i]}`);
        await sendMessageWithRetry(numeros[i], mensagem);
        sucessos++;
        
        // Cooldown a cada 10 mensagens
        if ((i + 1) % 10 === 0) {
          console.log(`🛑 Cooldown de 30 segundos após 10 mensagens...`);
          await delay(30000);
        }
      } catch (error) {
        erros++;
        console.error(`❌ Erro ao enviar para ${numeros[i]}:`, error.message);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎉 ENVIO EM MASSA CONCLUÍDO`);
    console.log(`✅ Sucessos: ${sucessos}/${numeros.length}`);
    console.log(`❌ Erros: ${erros}/${numeros.length}`);
    console.log(`📊 Taxa de sucesso: ${((sucessos/numeros.length) * 100).toFixed(1)}%`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error('❌ Erro no endpoint /api/send-bulk:', error);
  }
});

app.get('/health', (req, res) => {
  const onlineCount = instanceNames.filter(name => 
    instanceStatus[name] === 'online'
  ).length;
  
  res.json({
    status: 'online',
    instances: {
      total: instanceNames.length,
      online: onlineCount
    }
  });
});

// ============= INICIAR SERVIDOR =============
const PORT = 3333;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 SERVIDOR WHATSAPP ANTI-DESCONEXÃO`);
  console.log(`${'='.repeat(60)}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status`);
  console.log(`📋 Logs: http://localhost:${PORT}/api/logs`);
  console.log(`${'='.repeat(60)}`);
  console.log(`⚙️ CONFIGURAÇÕES ANTI-DESCONEXÃO:`);
  console.log(`   • Rate limit: ${RATE_LIMIT.messagesPerMinute} msgs/min`);
  console.log(`   • Delay entre mensagens: ${RATE_LIMIT.delayBetweenMessages}ms`);
  console.log(`   • Cooldown após lote: ${RATE_LIMIT.cooldownAfterBatch}ms`);
  console.log(`   • Retry automático: ${RATE_LIMIT.maxRetries}x`);
  console.log(`   • Reconexão automática: SIM`);
  console.log(`${'='.repeat(60)}\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️ Encerrando servidor...');
  for (const [name, client] of Object.entries(clients)) {
    try {
      await client.destroy();
      console.log(`✅ ${name}: Desconectado`);
    } catch (error) {
      console.log(`⚠️ ${name}: Erro ao desconectar`);
    }
  }
  process.exit(0);
});
