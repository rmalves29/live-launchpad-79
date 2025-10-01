/**
 * server-whatsapp-individual-no-env.js — Servidor WhatsApp por empresa (sem .env)
 * Uso (PowerShell):
 * $env:SUPABASE_SERVICE_ROLE="eyJhbGciOiJI..."; $env:TENANT_ID="08f2b1b9-3988-489e-8186-c60f0c0b0622"; $env:TENANT_SLUG="app"; node server-whatsapp-individual-no-env.js
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
  process.env.SUPABASE_SERVICE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';

if (!SUPABASE_SERVICE_ROLE) {
  console.error('❌ [FATAL] Configure SUPABASE_SERVICE_ROLE no PowerShell:');
  console.error('   $env:SUPABASE_SERVICE_ROLE="eyJhbGciOiJI...SUA_SERVICE_ROLE_AQUI"');
  console.error('   $env:TENANT_ID="08f2b1b9-3988-489e-8186-c60f0c0b0622"');
  console.error('   $env:TENANT_SLUG="app"');
  console.error('   node server-whatsapp-individual-no-env.js');
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

// Normalização para armazenamento (sem DDI)
function normalizeForStorage(phone) {
  if (!phone) return phone;
  
  const cleanPhone = phone.replace(/\D/g, '');
  let phoneWithoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  if (phoneWithoutDDI.length < 10) {
    return phoneWithoutDDI;
  }
  
  const ddd = parseInt(phoneWithoutDDI.substring(0, 2));
  const restOfNumber = phoneWithoutDDI.substring(2);
  
  if (ddd < 31 && !restOfNumber.startsWith('9') && restOfNumber.length === 8) {
    phoneWithoutDDI = phoneWithoutDDI.substring(0, 2) + '9' + phoneWithoutDDI.substring(2);
  } else if (ddd >= 31 && restOfNumber.startsWith('9') && restOfNumber.length === 9) {
    phoneWithoutDDI = phoneWithoutDDI.substring(0, 2) + phoneWithoutDDI.substring(3);
  }
  
  return phoneWithoutDDI;
}

// Normalização para envio (com DDI) - renomeando a função original
/**
 * Normaliza número de telefone brasileiro para WhatsApp
 * - Remove caracteres não numéricos
 * - Adiciona DDI 55 se necessário
 * - Garante o 9º dígito para celulares (números com 10 dígitos após DDD)
 */
function normalizeForSending(phone) {
  if (!phone) return phone;
  
  const cleanPhone = phone.replace(/\D/g, '');
  const withoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  let normalized = withoutDDI;
  
  if (normalized.length >= 10 && normalized.length <= 11) {
    const ddd = parseInt(normalized.substring(0, 2));
    
    if (ddd >= 11 && ddd <= 99) {
      if (normalized.length === 10) {
        const firstDigitAfterDDD = normalized[2];
        if (firstDigitAfterDDD !== '9') {
          normalized = normalized.substring(0, 2) + '9' + normalized.substring(2);
          console.log(`✅ 9º dígito adicionado: ${phone} -> ${normalized}`);
        }
      }
    }
  }
  
  return '55' + normalized;
}

function normalizeDDD(phone) {
  return normalizeForSending(phone);
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

async function composeItemAdded(product, quantity = 1) {
  const template = await getTemplate('ITEM_ADDED');
  const totalPrice = Number(product.price || 0) * Number(quantity);
  
  if (template) {
    return replaceVariables(template.content, {
      produto: product.name || 'Produto',
      codigo: product.code ? `(${product.code})` : '',
      quantidade: String(quantity),
      preco: fmtMoney(product.price),
      valor: fmtMoney(product.price),
      total: fmtMoney(totalPrice),
    });
  }
  
  const productCode = product.code ? ` (${product.code})` : '';
  const price = fmtMoney(product.price);
  const total = fmtMoney(totalPrice);
  return `🛒 *Item adicionado ao pedido*\n\n✅ ${product.name}${productCode}\nQtd: *${quantity}*\nPreço: *${price}*\nTotal: *${total}*\n\nDigite *FINALIZAR* para concluir seu pedido.`;
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

// Mensagem de pedido pago
async function composePaidOrder(orderData) {
  const template = await getTemplate('PAID_ORDER');
  if (template) {
    return replaceVariables(template.content, {
      order_id: String(orderData.id || 'N/A'),
      total: fmtMoney(orderData.total_amount || 0),
      customer_name: orderData.customer_name || 'Cliente',
    });
  }
  return `🎉 *Pagamento Confirmado - Pedido #${orderData.id}*\n\n✅ Recebemos seu pagamento!\n💰 Valor: *${fmtMoney(orderData.total_amount)}*\n\nSeu pedido está sendo preparado para envio.\n\nObrigado pela preferência! 💚`;
}

/* ============================ WHATSAPP CLIENT ============================ */
const client = new Client({
  authStrategy: new LocalAuth({ clientId: TENANT_SLUG }),
  puppeteer: {
    headless: false,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
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
            authorPhone = normalizeForStorage(msg.author.replace('@c.us', ''));
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
      authorPhone = normalizeForStorage(msg.from.replace('@c.us', ''));
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
  const normalizedPhone = normalizeForStorage(phone);
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

// ===== CONTROLE DE JOBS DE ENVIO =====

// Criar/Atualizar job de envio
app.post('/sending-job/start', async (req, res) => {
  try {
    const { jobType, totalItems, jobData } = req.body;
    if (!jobType || !totalItems || !jobData) {
      return res.status(400).json({ error: 'jobType, totalItems e jobData são obrigatórios' });
    }

    const job = await supa('/sending_jobs', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        job_type: jobType,
        status: 'running',
        total_items: totalItems,
        processed_items: 0,
        current_index: 0,
        job_data: jobData,
        started_at: new Date().toISOString(),
      }),
    });

    res.json({ success: true, job: job?.[0] });
  } catch (error) {
    console.error('❌ Erro ao criar job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Atualizar progresso do job
app.post('/sending-job/update', async (req, res) => {
  try {
    const { jobId, processedItems, currentIndex, status } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId é obrigatório' });

    const updateData = { updated_at: new Date().toISOString() };
    if (processedItems !== undefined) updateData.processed_items = processedItems;
    if (currentIndex !== undefined) updateData.current_index = currentIndex;
    if (status) {
      updateData.status = status;
      if (status === 'paused') updateData.paused_at = new Date().toISOString();
      if (status === 'completed') updateData.completed_at = new Date().toISOString();
    }

    await supa(`/sending_jobs?id=eq.${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erro ao atualizar job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar job pausado
app.get('/sending-job/pending', async (req, res) => {
  try {
    const { jobType } = req.query;
    if (!jobType) return res.status(400).json({ error: 'jobType é obrigatório' });

    const jobs = await supa(`/sending_jobs?job_type=eq.${jobType}&status=eq.paused&order=created_at.desc&limit=1`);
    
    res.json({ success: true, job: jobs?.[0] || null });
  } catch (error) {
    console.error('❌ Erro ao buscar job pendente:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/send', async (req, res) => {
  try {
    if (!clientReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });

    const normalizedNumber = normalizeForSending(number);
    await client.sendMessage(`${normalizedNumber}@c.us`, message);

    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID, phone: normalizeForStorage(number), message, type: 'outgoing', sent_at: new Date().toISOString()
      })
    });

    res.json({ success: true, phone: normalizeForStorage(number) });
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ============================ WHATSAPP SEND HELPER ============================ */
async function sendWhatsAppMessage(phone, message, messageType = 'outgoing') {
  const normalizedPhone = normalizeForSending(phone);
  
  if (!clientReady) {
    throw new Error('WhatsApp não está conectado');
  }

  // Enviar mensagem via WhatsApp
  await client.sendMessage(`${normalizedPhone}@c.us`, message);
  
  // Registrar no banco de dados
  await supa('/whatsapp_messages', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: TENANT_ID,
      phone: normalizeForStorage(phone),
      message,
      type: messageType,
      sent_at: new Date().toISOString(),
    }),
  });
  
  console.log(`✅ Mensagem ${messageType} enviada para ${normalizedPhone}`);
  return { success: true, phone: normalizeForStorage(phone) };
}

// Endpoint para enviar mensagem de item adicionado (pedido manual)
app.post('/send-item-added', async (req, res) => {
  console.log('🛒 ===== REQUISIÇÃO RECEBIDA: /send-item-added =====');
  console.log('📥 Body recebido:', JSON.stringify(req.body, null, 2));
  console.log('📱 WhatsApp Status:', clientReady ? '✅ CONECTADO' : '❌ DESCONECTADO');
  
  try {
    const { phone, product_id, quantity = 1 } = req.body;
    
    if (!phone || !product_id) {
      console.log('❌ ERRO: Parâmetros faltando - phone:', phone, 'product_id:', product_id);
      return res.status(400).json({ error: 'Telefone e ID do produto são obrigatórios' });
    }

    // Verificar se WhatsApp está conectado
    if (!clientReady) {
      console.log('❌ ERRO: WhatsApp não está conectado! Conecte o WhatsApp primeiro.');
      return res.status(503).json({ 
        error: 'WhatsApp não está conectado. Por favor, escaneie o QR Code primeiro.',
        clientReady: false
      });
    }

    console.log(`📋 Buscando produto ${product_id} para telefone ${phone}`);

    // Buscar informações do produto
    const products = await supa(`/products?select=*&id=eq.${product_id}`);
    const product = products?.[0];

    if (!product) {
      console.log(`❌ Produto ${product_id} não encontrado no banco`);
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    console.log(`📦 Produto encontrado: ${product.name} (${product.code}) - R$ ${product.price}`);

    // Normalizar telefone
    const normalizedPhone = normalizeForSending(phone);
    console.log(`📞 Telefone normalizado: ${phone} → ${normalizedPhone}`);

    // Compor mensagem
    const message = await composeItemAdded(product, quantity);
    console.log(`📝 Mensagem composta (${message.length} caracteres):\n${message}`);

    // Enviar mensagem
    console.log(`📤 Enviando mensagem para ${normalizedPhone}@c.us...`);
    await client.sendMessage(`${normalizedPhone}@c.us`, message);
    console.log(`✅ Mensagem enviada via WhatsApp!`);
    
    // Registrar no banco
    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        phone: normalizeForStorage(phone),
        message,
        type: 'outgoing',
        sent_at: new Date().toISOString(),
      }),
    });
    console.log(`💾 Mensagem registrada no banco`);
    
    console.log(`✅ ===== SUCESSO: Mensagem enviada =====`);
    res.json({ 
      success: true, 
      phone: normalizeForStorage(phone),
      normalizedPhone: normalizedPhone,
      product: product.name, 
      message 
    });
  } catch (error) {
    console.error('❌ ===== ERRO CRÍTICO =====');
    console.error('❌ Mensagem:', error.message);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Endpoint para enviar confirmação de pedido pago
app.post('/send-paid-order', async (req, res) => {
  console.log('💰 Requisição para enviar confirmação de pagamento');
  
  try {
    const { phone, order_id } = req.body;
    
    if (!phone || !order_id) {
      return res.status(400).json({ error: 'Telefone e ID do pedido são obrigatórios' });
    }

    console.log(`📋 Buscando pedido ${order_id} para telefone ${phone}`);

    // Buscar informações do pedido
    const orders = await supa(`/orders?select=*&id=eq.${order_id}`);
    const order = orders?.[0];

    if (!order) {
      console.log(`❌ Pedido ${order_id} não encontrado`);
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    console.log(`🧾 Pedido encontrado: #${order.id} - ${fmtMoney(order.total_amount)}`);

    // Compor e enviar mensagem
    const message = await composePaidOrder(order);
    const result = await sendWhatsAppMessage(phone, message, 'outgoing');
    
    console.log(`✅ Confirmação de pagamento enviada com sucesso`);
    res.json({ ...result, order_id: order.id, message });
  } catch (error) {
    console.error('❌ Erro ao enviar confirmação de pagamento:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para enviar mensagem de finalização
app.post('/send-finalize', async (req, res) => {
  console.log('✅ Requisição para enviar mensagem de finalização');
  
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Telefone é obrigatório' });
    }

    console.log(`📋 Enviando mensagem de finalização para ${phone}`);

    const message = await composeFinalize();
    const result = await sendWhatsAppMessage(phone, message, 'outgoing');
    
    console.log(`✅ Mensagem de finalização enviada com sucesso`);
    res.json({ ...result, message });
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem de finalização:', error);
    res.status(500).json({ error: error.message });
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

    console.log('🔍 Buscando todos os grupos...');
    const chats = await client.getChats();
    console.log(`📱 Total de chats encontrados: ${chats.length}`);
    
    const groups = chats.filter(chat => chat.isGroup);
    console.log(`👥 Total de grupos encontrados: ${groups.length}`);
    
    const groupList = groups.map((group) => {
      return {
        id: group.id._serialized,
        name: group.name,
        participantCount: group.participants ? group.participants.length : 0,
        isActive: !group.archived,
        description: group.description || ''
      };
    });

    console.log(`✅ Lista de grupos processada: ${groupList.length} grupos`);
    
    res.json({
      success: true,
      groups: groupList,
      total: groupList.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar grupos:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: 'Verifique se o WhatsApp está conectado'
    });
  }
});

// Enviar mensagem para grupo WhatsApp
app.post('/send-to-group', async (req, res) => {
  console.log('📤 Requisição para enviar mensagem para grupo');
  
  try {
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    const { groupId, message, imageUrl } = req.body;
    
    if (!groupId || !message) {
      return res.status(400).json({ 
        error: 'Group ID e mensagem são obrigatórios' 
      });
    }

    console.log(`📋 Enviando para grupo: ${groupId}`);
    console.log(`💬 Mensagem: ${message.substring(0, 50)}...`);
    
    // Verificar se o grupo existe
    const chats = await client.getChats();
    const group = chats.find(chat => chat.id._serialized === groupId && chat.isGroup);
    
    if (!group) {
      return res.status(404).json({ 
        success: false,
        error: 'Grupo não encontrado',
        groupId: groupId
      });
    }

    console.log(`👥 Grupo encontrado: ${group.name} (${group.participants ? group.participants.length : 0} participantes)`);

    // Enviar mensagem
    let result;
    if (imageUrl) {
      console.log(`🖼️ Enviando imagem: ${imageUrl}`);
      const media = await MessageMedia.fromUrl(imageUrl);
      result = await client.sendMessage(groupId, media, { caption: message });
    } else {
      result = await client.sendMessage(groupId, message);
    }

    console.log(`✅ Mensagem enviada com sucesso para ${group.name}`);

    // Salvar no banco de dados (mensagem para grupo)
    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID, 
        phone: groupId, // Usar o ID do grupo como phone para diferenciação
        message: message,
        type: 'outgoing_group',
        sent_at: new Date().toISOString(),
        group_name: group.name
      })
    });

    res.json({ 
      success: true, 
      groupId: groupId,
      groupName: group.name,
      messageId: result.id._serialized,
      participantCount: group.participants ? group.participants.length : 0
    });
    
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem para grupo:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: 'Erro ao enviar mensagem para o grupo'
    });
  }
});

// ===== BROADCAST BY ORDER STATUS AND DATE =====
app.post('/api/broadcast/orders', async (req, res) => {
  console.log('📢 Requisição de broadcast por status de pedidos e data');
  
  try {
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    const { key, status, message, startDate, endDate, interval = 2000, batchSize = 5, batchDelay = 3000 } = req.body;

    // Validação de segurança (opcional)
    if (key !== 'whatsapp-broadcast-2024') {
      return res.status(403).json({ error: 'Chave de broadcast inválida' });
    }

    if (!message || !status) {
      return res.status(400).json({ error: 'Mensagem e status são obrigatórios' });
    }

    console.log(`📊 Filtros: Status=${status}, Data Inicial=${startDate || 'N/A'}, Data Final=${endDate || 'N/A'}`);

    // Construir query para buscar pedidos
    let query = '/orders?select=customer_phone,customer_name';
    
    // Filtro de status de pagamento
    if (status === 'paid') {
      query += '&is_paid=eq.true';
    } else if (status === 'unpaid') {
      query += '&is_paid=eq.false';
    }
    // Se status === 'all', não adiciona filtro de pagamento

    // Filtro de data
    if (startDate) {
      query += `&created_at=gte.${startDate}T00:00:00`;
    }
    if (endDate) {
      query += `&created_at=lte.${endDate}T23:59:59`;
    }

    console.log(`🔍 Query Supabase: ${query}`);

    // Buscar pedidos do banco de dados
    const orders = await supa(query);
    
    if (!orders || orders.length === 0) {
      console.log('⚠️  Nenhum pedido encontrado com os filtros especificados');
      return res.json({ 
        success: true, 
        total: 0, 
        message: 'Nenhum pedido encontrado com os filtros especificados' 
      });
    }

    // Extrair números únicos
    const uniquePhones = [...new Set(orders.map(o => o.customer_phone).filter(Boolean))];
    console.log(`📱 Total de números únicos encontrados: ${uniquePhones.length}`);

    if (uniquePhones.length === 0) {
      return res.json({ 
        success: true, 
        total: 0, 
        message: 'Nenhum telefone válido encontrado' 
      });
    }

    // Enviar mensagens em lotes
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < uniquePhones.length; i += batchSize) {
      const batch = uniquePhones.slice(i, i + batchSize);
      console.log(`📤 Enviando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniquePhones.length / batchSize)}`);

      await Promise.all(
        batch.map(async (phone) => {
          try {
            const normalizedPhone = normalizeForSending(phone);
            const chatId = `${normalizedPhone}@c.us`;

            await client.sendMessage(chatId, message);
            successCount++;

            // Registrar no banco
            await supa('/whatsapp_messages', {
              method: 'POST',
              body: JSON.stringify({
                tenant_id: TENANT_ID,
                phone: normalizeForStorage(phone),
                message,
                type: 'bulk',
                sent_at: new Date().toISOString()
              })
            });

            await delay(interval);
          } catch (error) {
            console.error(`❌ Erro ao enviar para ${phone}:`, error.message);
            errorCount++;
          }
        })
      );

      // Delay entre lotes
      if (i + batchSize < uniquePhones.length) {
        console.log(`⏳ Aguardando ${batchDelay}ms antes do próximo lote...`);
        await delay(batchDelay);
      }
    }

    console.log(`✅ Broadcast concluído: ${successCount} sucessos, ${errorCount} erros`);

    res.json({
      success: true,
      total: successCount,
      errors: errorCount,
      message: `Mensagem enviada para ${successCount} contatos`
    });

  } catch (error) {
    console.error('❌ Erro no broadcast:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/* ============================ INICIALIZAÇÃO ============================ */
console.log('🚀 Iniciando servidor WhatsApp individual...');
console.log(`📍 Tenant: ${TENANT_SLUG} (${TENANT_ID})`);

client.initialize();

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  console.log(`📋 Status: http://localhost:${PORT}/status`);
  console.log(`📤 Enviar: POST http://localhost:${PORT}/send`);
  console.log(`🛒 Item Adicionado: POST http://localhost:${PORT}/send-item-added`);
  console.log(`💰 Pedido Pago: POST http://localhost:${PORT}/send-paid-order`);
  console.log(`✅ Finalizar: POST http://localhost:${PORT}/send-finalize`);
  console.log(`📋 Listar grupos: GET http://localhost:${PORT}/list-all-groups`);
  console.log(`📤 Enviar para grupo: POST http://localhost:${PORT}/send-to-group`);
  console.log(`📢 Broadcast: POST http://localhost:${PORT}/api/broadcast/orders`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  if (clientReady) await client.destroy();
  process.exit();
});

console.log('\n📖 COMANDO PARA EXECUTAR:');
console.log('node server-whatsapp-individual-no-env.js');
console.log('\n✅ Service Role Key já está configurada! Sistema pronto!');
console.log('\n📡 ENDPOINTS DISPONÍVEIS:');
console.log('  POST /send - Enviar mensagem genérica');
console.log('  POST /send-item-added - Enviar confirmação de item adicionado (pedido manual)');
console.log('  POST /send-paid-order - Enviar confirmação de pagamento');
console.log('  POST /send-finalize - Enviar mensagem de finalização');
console.log('  GET  /list-all-groups - Listar todos os grupos WhatsApp');
console.log('  POST /send-to-group - Enviar mensagem para grupo');
console.log('  POST /api/broadcast/orders - Envio em massa por status de pedido');
console.log('\n💡 EXEMPLO DE USO - Enviar item adicionado:');
console.log('  curl -X POST http://localhost:3333/send-item-added \\');
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"phone":"31999999999","product_id":123,"quantity":1}\'');