/**
 * server-whatsapp-groups.js — Servidor WhatsApp com suporte a grupos
 * Extensão do servidor individual com funcionalidades para grupos
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');

// fetch (fallback)
if (typeof fetch !== 'function') {
  global.fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
}

/* ============================ CONFIG ============================ */
const PORT = process.env.PORT || 3333;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hxtbsieodbtzgcvvkeqx.supabase.co';

// service_role obrigatória
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_SERVICE_ROLE) {
  console.error('❌ [FATAL] Configure SUPABASE_SERVICE_ROLE no PowerShell:');
  console.error('   $env:SUPABASE_SERVICE_ROLE="eyJhbGciOiJI...SUA_SERVICE_ROLE_AQUI"');
  console.error('   $env:TENANT_ID="08f2b1b9-3988-489e-8186-c60f0c0b0622"');
  console.error('   $env:TENANT_SLUG="app"');
  console.error('   node server-whatsapp-groups.js');
  process.exit(1);
}
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE;

// Tenant
const TENANT_ID = process.env.TENANT_ID || '08f2b1b9-3988-489e-8186-c60f0c0b0622';
const TENANT_SLUG = process.env.TENANT_SLUG || 'app';

console.log(`🏢 Inicializando servidor para tenant: ${TENANT_SLUG} (${TENANT_ID})`);
console.log(`🔐 Modo Supabase: service_role (RLS ignorada no servidor)`);

// Diagnóstico do JWT (não imprime o token)
try {
  const payload = (SUPABASE_KEY || '').split('.')[1];
  const claims = payload ? JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) : null;
  console.log(`🧪 JWT role: ${claims?.role || 'N/A'} | exp: ${claims?.exp ? new Date(claims.exp * 1000).toISOString() : 'N/A'}`);
  if (claims?.role !== 'service_role') {
    console.error('⚠️  Token não é service_role! Verifique se colou a Service Role completa.');
  }
} catch {
  console.log('⚠️ Não foi possível decodificar o JWT de SUPABASE_SERVICE_ROLE.');
}

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));
function fmtMoney(v) { return `R$ ${Number(v||0).toFixed(2).replace('.', ',')}`; }

// Normalização de DDD: se DDD < 31 adiciona 9, se >= 31 remove 9
function normalizeDDD(phone) {
  if (!phone) return phone;
  const cleanPhone = phone.replace(/\D/g, '');
  let normalizedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  if (normalizedPhone.length >= 4) {
    const ddd = parseInt(normalizedPhone.substring(2, 4));
    const restOfNumber = normalizedPhone.substring(4);
    if (ddd < 31 && !restOfNumber.startsWith('9') && restOfNumber.length === 8) {
      normalizedPhone = normalizedPhone.substring(0, 4) + '9' + normalizedPhone.substring(4);
    } else if (ddd >= 31 && restOfNumber.startsWith('9') && restOfNumber.length === 9) {
      normalizedPhone = normalizedPhone.substring(0, 4) + normalizedPhone.substring(5);
    }
  }
  return normalizedPhone;
}

/* ============================ SUPABASE ============================ */
async function supaRaw(pathname, init) {
  const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1${pathname}`;
  const baseHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  const finalInit = { ...(init || {}), headers: { ...baseHeaders, ...((init && init.headers) || {}) } };
  if ((finalInit.method || '').toUpperCase() === 'POST' && !('Prefer' in finalInit.headers)) {
    finalInit.headers.Prefer = 'return=representation';
  }
  const res = await fetch(url, finalInit);
  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ Supabase ${res.status} ${pathname}: ${text}`);
    throw new Error(`Supabase ${res.status} ${pathname} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function supa(pathname, init) {
  const separator = pathname.includes('?') ? '&' : '?';
  pathname += `${separator}tenant_id=eq.${TENANT_ID}`;
  return supaRaw(pathname, init);
}

/* ============================ TEMPLATES ============================ */
let templatesCache = {};
let templatesCacheTime = 0;

async function getTemplate(type) {
  const now = Date.now();
  if (now - templatesCacheTime > 300000) { // 5 min
    try {
      const templates = await supa('/whatsapp_templates?select=*');
      templatesCache = {};
      templates.forEach(t => templatesCache[t.type] = t);
      templatesCacheTime = now;
      console.log(`📄 Templates carregados:`, Object.keys(templatesCache));
    } catch (e) {
      console.error('❌ Erro ao buscar templates:', e.message);
    }
  }
  return templatesCache[type] || null;
}

function replaceVariables(template, variables) {
  if (!template) return '';
  let result = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, variables[key] || '');
  });
  return result;
}

async function composeItemAdded(product) {
  const template = await getTemplate('ITEM_ADDED');
  if (template) {
    return replaceVariables(template.content, {
      produto: product.name || 'Produto',
      codigo: product.code ? `(${product.code})` : '',
      quantidade: '1',
      preco: fmtMoney(product.price),
      total: fmtMoney(product.price)
    });
  }
  const productCode = product.code ? ` (${product.code})` : '';
  const price = fmtMoney(product.price);
  return `🛒 *Item adicionado ao pedido*\n\n✅ ${product.name}${productCode}\nQtd: *1*\nPreço: *${price}*`;
}

// Mensagem para finalizar compra
async function composeFinalize() {
  const template = await getTemplate('FINALIZAR');
  if (template) return template.content;
  return (
    'Perfeita a sua escolha! 💖 Já deixei separada.\n' +
    'Para pagar agora: clique no link, coloque o seu telefone.\n' +
    '👉 https://app.orderzaps.com/checkout'
  );
}

/* ============================ WHATSAPP CLIENT ============================ */
const client = new Client({
  authStrategy: new LocalAuth({ clientId: TENANT_SLUG }),
  puppeteer: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions'
    ]
  },
  // Configurações adicionais para compatibilidade
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  }
});

let clientReady = false;

client.on('qr', (qr) => {
  console.log('📱 Escaneie o QR Code:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => { console.log('✅ WhatsApp conectado!'); clientReady = true; });
client.on('authenticated', () => console.log('🔑 WhatsApp autenticado!'));
client.on('auth_failure', () => console.log('❌ Falha na autenticação do WhatsApp'));

client.on('message', async (msg) => {
  try {
    let groupName = null;
    let authorPhone = null;
    let messageFrom = msg.from;
    
    console.log(`📨 Mensagem recebida para tenant ${TENANT_SLUG}:`, {
      from: msg.from,
      body: msg.body,
      hasAuthor: !!msg.author
    });

    // Verificar se é mensagem de grupo
    if (msg.from && msg.from.includes('@g.us')) {
      try {
        // Obter chat para pegar nome do grupo
        const chat = await msg.getChat();
        if (chat && chat.isGroup) {
          groupName = chat.name || 'Grupo WhatsApp';
          console.log(`📱 Grupo identificado: ${groupName}`);
          
          // Para grupos, usar o author como remetente individual
          if (msg.author) {
            authorPhone = msg.author.replace('@c.us', '');
            messageFrom = msg.author;
            console.log(`👤 Autor do grupo: ${authorPhone}`);
          } else {
            console.log(`⚠️ Mensagem de grupo sem author definido`);
            // Se não temos o author, vamos ignorar esta mensagem para evitar dados inválidos
            return;
          }
        }
      } catch (chatError) {
        console.error('❌ Erro ao obter informações do grupo:', chatError.message);
        // Em caso de erro, tratar como mensagem individual
      }
    } else {
      // Mensagem individual - usar o from normalmente
      authorPhone = msg.from.replace('@c.us', '');
    }

    // Se não conseguimos determinar um telefone válido, não processar
    if (!authorPhone) {
      console.log(`⚠️ Não foi possível determinar telefone válido para a mensagem`);
      return;
    }

    // Preparar payload para webhook
    const webhookPayload = {
      from: messageFrom,
      body: msg.body || '',
      groupName: groupName,
      author: authorPhone,
      chatName: groupName
    };

    console.log(`🔗 Enviando para webhook:`, webhookPayload);

    // Chamar webhook se configurado
    try {
      const webhookUrl = `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-multitenant/${TENANT_ID}`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload)
      });

      if (response.ok) {
        console.log(`✅ Webhook enviado com sucesso:`, response.status);
      } else {
        console.log(`⚠️ Webhook retornou status:`, response.status);
      }
    } catch (webhookError) {
      console.error('❌ Erro ao chamar webhook:', webhookError.message);
    }
    
    // Salvar mensagem no banco
    try {
      await supa('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          phone: authorPhone,
          message: msg.body || '',
          type: 'incoming',
          received_at: new Date().toISOString(),
          whatsapp_group_name: groupName
        })
      });
      console.log(`💾 Mensagem salva no banco`);
    } catch (dbError) {
      console.error('❌ Erro ao salvar no banco:', dbError.message);
    }

    const text = String(msg.body || '').trim().toUpperCase();
    console.log(`🔍 Texto processado: "${text}"`);
    
    // Se o cliente digitar apenas "finalizar", responder com o template FINALIZAR
    if (text === 'FINALIZAR') {
      const message = await composeFinalize();
      await client.sendMessage(messageFrom, message);
      console.log(`✅ Mensagem FINALIZAR enviada para ${messageFrom}`);
      return;
    }
    
    const match = text.match(/^(?:[CPA]\s*)?(\d{1,6})$/);
    console.log(`🎯 Match encontrado:`, match);
    
    if (match) {
      const numeric = match[1];
      const candidates = [`C${numeric}`, `P${numeric}`, `A${numeric}`, numeric];
      console.log(`🔍 Buscando produtos com códigos:`, candidates);
      
      const products = await supa(`/products?select=*&is_active=eq.true&code=in.(${candidates.map(c => `"${c}"`).join(',')})`);
      console.log(`📦 Produtos encontrados:`, products?.length || 0);
      
      const product = products?.[0];
      if (product) {
        console.log(`🎯 Produto encontrado: ${product.name} (${product.code})`);
        await processProductCode(authorPhone, product, groupName);
        const message = await composeItemAdded(product);
        await client.sendMessage(messageFrom, message);
        console.log(`✅ Confirmação enviada para ${messageFrom}`);
      } else {
        console.log(`❌ Nenhum produto encontrado para os códigos:`, candidates);
      }
    } else {
      console.log(`❌ Mensagem não corresponde ao padrão de código: "${text}"`);
    }
  } catch (error) {
    console.error('❌ Erro geral ao processar mensagem:', error.message);
    console.error('Stack trace:', error.stack);
  }
});

async function upsertOrderForCart(cart, customerPhone, eventDate) {
  try {
    const items = await supa(`/cart_items?select=qty,unit_price&cart_id=eq.${cart.id}`);
    const total = Array.isArray(items)
      ? items.reduce((sum, it) => sum + Number(it.unit_price || 0) * Number(it.qty || 1), 0)
      : 0;

    const existing = await supa(`/orders?select=*&cart_id=eq.${cart.id}`);
    let order = existing?.[0];

    if (!order) {
      const inserted = await supa('/orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          cart_id: cart.id,
          event_date: eventDate,
          total_amount: total,
          is_paid: false,
          customer_phone: customerPhone,
          event_type: 'whatsapp'
        })
      });
      order = inserted?.[0];
      console.log(`🧾 Pedido criado automaticamente: #${order?.id || 'N/A'} (total ${fmtMoney(total)})`);
    } else {
      await supa(`/orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ total_amount: total })
      });
      console.log(`🧾 Pedido atualizado (#${order.id}) total ${fmtMoney(total)}`);
    }

    return order;
  } catch (err) {
    console.error('❌ Erro ao criar/atualizar pedido:', err);
    return null;
  }
}

async function processProductCode(phone, product, groupName = null) {
  const normalizedPhone = normalizeDDD(phone);
  const today = new Date().toISOString().split('T')[0];

  try {
    let customers = await supa(`/customers?select=*&phone=eq.${normalizedPhone}`);
    let customer = customers?.[0];

    if (!customer) {
      const newCustomers = await supa('/customers', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ tenant_id: TENANT_ID, phone: normalizedPhone, name: normalizedPhone })
      });
      customer = newCustomers?.[0];
    }

    let carts = await supa(`/carts?select=*&customer_phone=eq.${normalizedPhone}&event_date=eq.${today}&status=eq.OPEN`);
    let cart = carts?.[0];

    if (!cart) {
      const newCarts = await supa('/carts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          tenant_id: TENANT_ID, customer_phone: normalizedPhone, event_date: today, event_type: 'whatsapp', status: 'OPEN', whatsapp_group_name: groupName
        })
      });
      cart = newCarts?.[0];
    }

    if (cart) {
      await supa('/cart_items', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: TENANT_ID, cart_id: cart.id, product_id: product.id, qty: 1, unit_price: product.price
        })
      });
      console.log(`🛒 Produto ${product.code} adicionado ao carrinho do cliente ${normalizedPhone}`);

      // Criar/atualizar pedido automaticamente vinculado ao carrinho
      await upsertOrderForCart(cart, normalizedPhone, today);
    }
  } catch (error) {
    console.error('❌ Erro ao processar código do produto:', error);
    throw error;
  }
}

/* ============================ FUNÇÕES DE GRUPO ============================ */

// Identificar grupos que um número participa
async function identifyUserGroups(phone) {
  try {
    if (!clientReady) {
      throw new Error('WhatsApp não está conectado');
    }

    const normalizedPhone = normalizeDDD(phone);
    const chats = await client.getChats();
    
    // Filtrar apenas grupos
    const groups = chats.filter(chat => chat.isGroup);
    const userGroups = [];

    for (const group of groups) {
      try {
        const participants = await group.getParticipants();
        const isParticipant = participants.some(participant => 
          participant.id.user === normalizedPhone || 
          participant.id.user === normalizedPhone.replace('55', '')
        );

        if (isParticipant) {
          userGroups.push({
            id: group.id._serialized,
            name: group.name,
            participantCount: participants.length
          });
        }
      } catch (error) {
        console.error(`❌ Erro ao verificar participantes do grupo ${group.name}:`, error);
      }
    }

    console.log(`📋 Encontrados ${userGroups.length} grupos para ${phone}:`, userGroups.map(g => g.name));
    return userGroups;
  } catch (error) {
    console.error('❌ Erro ao identificar grupos:', error);
    throw error;
  }
}

// Enviar mensagem para grupo específico
async function sendToGroup(groupId, message, imageUrl = null) {
  try {
    if (!clientReady) {
      throw new Error('WhatsApp não está conectado');
    }

    console.log(`🚀 Tentando enviar mensagem para grupo: ${groupId}`);

    // Verificar se o grupo existe primeiro
    let targetGroup = null;
    try {
      const chats = await client.getChats();
      targetGroup = chats.find(chat => chat.isGroup && chat.id._serialized === groupId);
      
      if (!targetGroup) {
        throw new Error(`Grupo ${groupId} não encontrado`);
      }
      console.log(`✅ Grupo encontrado: ${targetGroup.name}`);
    } catch (error) {
      console.error(`❌ Erro ao buscar grupo ${groupId}:`, error.message);
      throw new Error(`Não foi possível encontrar o grupo: ${error.message}`);
    }

    let media = null;
    if (imageUrl) {
      try {
        console.log(`📷 Tentando carregar imagem: ${imageUrl}`);
        media = await MessageMedia.fromUrl(imageUrl);
        console.log(`✅ Imagem carregada com sucesso`);
      } catch (error) {
        console.error('❌ Erro ao carregar imagem:', error.message);
        // Continuar sem imagem se houver erro
        media = null;
      }
    }

    // Tentar enviar a mensagem com retry usando client.sendMessage diretamente
    let sendSuccess = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!sendSuccess && attempts < maxAttempts) {
      attempts++;
      try {
        console.log(`📤 Tentativa ${attempts}/${maxAttempts} de envio para ${targetGroup.name}`);

        if (media) {
          await client.sendMessage(groupId, media, { caption: message });
          console.log(`✅ Mensagem com imagem enviada para ${targetGroup.name}`);
        } else {
          await client.sendMessage(groupId, message);
          console.log(`✅ Mensagem de texto enviada para ${targetGroup.name}`);
        }
        
        sendSuccess = true;
      } catch (sendError) {
        console.error(`❌ Tentativa ${attempts} falhou:`, sendError.message);
        
        if (attempts < maxAttempts) {
          console.log(`⏳ Aguardando 2s antes da próxima tentativa...`);
          await delay(2000);
        } else {
          throw new Error(`Falha após ${maxAttempts} tentativas: ${sendError.message}`);
        }
      }
    }

    // Salvar no banco apenas se o envio foi bem-sucedido
    try {
      await supa('/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          phone: groupId,
          message: message,
          type: 'outgoing',
          sent_at: new Date().toISOString()
        })
      });
      console.log(`💾 Mensagem salva no banco de dados`);
    } catch (dbError) {
      console.error('⚠️ Erro ao salvar no banco (mensagem foi enviada):', dbError.message);
      // Não falhar aqui, pois a mensagem já foi enviada
    }

    return { 
      success: true, 
      groupId, 
      groupName: targetGroup.name,
      message: 'Mensagem enviada com sucesso'
    };
  } catch (error) {
    console.error('❌ Erro crítico ao enviar para grupo:', error.message);
    console.error('❌ Stack trace:', error.stack);
    
    // Retornar erro mais detalhado
    throw new Error(`Falha no envio: ${error.message}`);
  }
}

/* ============================ EXPRESS API ============================ */
const app = express();
app.use(express.json());
app.use(cors());

app.get('/status', (req, res) => {
  res.json({
    tenant: { id: TENANT_ID, slug: TENANT_SLUG },
    whatsapp: { ready: clientReady },
    supabase: {
      url: SUPABASE_URL,
      hasServiceRole: !!SUPABASE_SERVICE_ROLE,
      keyPreview: SUPABASE_SERVICE_ROLE ? `${SUPABASE_SERVICE_ROLE.substring(0, 20)}...` : 'N/A'
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/send', async (req, res) => {
  try {
    if (!clientReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });

    const normalizedNumber = normalizeDDD(number);
    await client.sendMessage(`${normalizedNumber}@c.us`, message);

    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID, phone: normalizedNumber, message, type: 'outgoing', sent_at: new Date().toISOString()
      })
    });

    res.json({ success: true, phone: normalizedNumber });
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    res.status(500).json({ error: error.message });
  }
});

// Nova rota para identificar grupos
app.post('/identify-groups', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Número é obrigatório' });

    const groups = await identifyUserGroups(phone);
    res.json({ success: true, groups });
  } catch (error) {
    console.error('❌ Erro ao identificar grupos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Nova rota para enviar para grupo
app.post('/send-to-group', async (req, res) => {
  try {
    console.log('📨 Recebida requisição para envio de grupo:', req.body);
    
    const { groupId, message, imageUrl } = req.body;
    if (!groupId || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'GroupId e mensagem são obrigatórios' 
      });
    }

    if (!clientReady) {
      return res.status(503).json({ 
        success: false,
        error: 'WhatsApp não está conectado. Aguarde a conexão.' 
      });
    }

    const result = await sendToGroup(groupId, message, imageUrl);
    
    console.log('✅ Resposta do envio:', result);
    res.json({ 
      success: true, 
      result,
      message: 'Mensagem enviada com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro na API de envio para grupo:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: 'Verifique se o WhatsApp está conectado e o grupo existe'
    });
  }
});

// Listar todos os grupos WhatsApp
app.get('/list-all-groups', async (req, res) => {
  console.log('📋 Requisição para listar todos os grupos');
  
  try {
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    if (!client?.info?.wid?._serialized) {
      return res.status(400).json({ 
        success: false, 
        error: 'WhatsApp não está devidamente inicializado' 
      });
    }

    console.log('🔍 Buscando chats...');
    const chats = await client.getChats();
    console.log(`📱 Total de chats encontrados: ${chats.length}`);

    const groups = chats
      .filter(chat => {
        const isGroup = chat.isGroup;
        console.log(`📋 Chat ${chat.name}: isGroup=${isGroup}`);
        return isGroup;
      })
      .map(chat => {
        const group = {
          id: chat.id._serialized,
          name: chat.name,
          participantCount: chat.participants ? chat.participants.length : 0
        };
        console.log(`✅ Grupo mapeado: ${group.name} (${group.participantCount} participantes)`);
        return group;
      });

    console.log(`📋 ${groups.length} grupos encontrados:`, groups.map(g => `${g.name} (ID: ${g.id.substring(0, 20)}...)`));
    
    res.json({
      success: true,
      groups: groups,
      total: groups.length
    });
  } catch (error) {
    console.error('❌ Erro ao listar grupos:', error.message);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao listar grupos: ' + error.message 
    });
  }
});

/* ============================ INICIALIZAÇÃO ============================ */
console.log('🚀 Iniciando servidor WhatsApp com suporte a grupos...');
console.log(`📍 Tenant: ${TENANT_SLUG} (${TENANT_ID})`);

client.initialize();

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  console.log(`📋 Status: http://localhost:${PORT}/status`);
  console.log(`📤 Enviar: POST http://localhost:${PORT}/send`);
  console.log(`👥 Identificar grupos: POST http://localhost:${PORT}/identify-groups`);
  console.log(`📨 Enviar para grupo: POST http://localhost:${PORT}/send-to-group`);
  console.log(`📋 Listar grupos: GET http://localhost:${PORT}/list-all-groups`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  if (clientReady) await client.destroy();
  process.exit();
});

console.log('\n📖 COMANDO PARA EXECUTAR (PowerShell):');
console.log('$env:SUPABASE_SERVICE_ROLE="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4"; $env:TENANT_ID="3c92bf57-a114-4690-b4cf-642078fc9df9"; $env:TENANT_SLUG="thaybiquini"; node server-whatsapp-groups.js');
console.log('\n✅ Sistema pronto com suporte a grupos WhatsApp!');