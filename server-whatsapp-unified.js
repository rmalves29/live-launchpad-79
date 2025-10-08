/**
 * server-whatsapp-unified.js — Servidor WhatsApp COMPLETO para Mania de Mulher
 * IMPORTANTE: Este servidor consolidado contém TODAS as funcionalidades de WhatsApp
 * 
 * Funcionalidades incluídas:
 * - Envio individual de mensagens
 * - Confirmação automática de pagamento
 * - Mensagem de produto cancelado
 * - Envio para grupos WhatsApp
 * - Broadcast por status de pedidos
 * - Processamento automático de códigos de produtos
 * - Sistema de templates
 * 
 * Uso (PowerShell):
 * $env:SUPABASE_SERVICE_ROLE="eyJhbGciOiJI..."; $env:TENANT_ID="08f2b1b9-3988-489e-8186-c60f0c0b0622"; $env:TENANT_SLUG="app"; node server-whatsapp-unified.js
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
  console.error('   node server-whatsapp-unified.js');
  process.exit(1);
}
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE;

// Tenant - MANIA DE MULHER (EXCLUSIVO)
const TENANT_ID = process.env.TENANT_ID || '08f2b1b9-3988-489e-8186-c60f0c0b0622';
const TENANT_SLUG = process.env.TENANT_SLUG || 'app';

console.log(`🏢 ═══════════════════════════════════════════════`);
console.log(`🏢 Servidor WhatsApp - MANIA DE MULHER (COMPLETO)`);
console.log(`🏢 ═══════════════════════════════════════════════`);
console.log(`🏢 Tenant: ${TENANT_SLUG} (${TENANT_ID})`);
console.log(`🔐 Modo Supabase: service_role (RLS ignorada no servidor)`);
console.log(`📱 Funcionalidades: TODAS consolidadas`);

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

/**
 * Gera URL assinada para imagens do Supabase Storage
 * @param {string} imageUrl - URL da imagem (pode ser pública ou não)
 * @returns {Promise<string>} - URL assinada ou URL original se não for do Supabase
 */
async function getSignedImageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;
  
  try {
    // Detectar se é uma URL do Supabase Storage
    const supabaseStoragePattern = /\/storage\/v1\/object\/(public|sign|authenticated)\/([^/]+)\/(.+)$/;
    const match = imageUrl.match(supabaseStoragePattern);
    
    if (!match) {
      console.log('🔗 URL não é do Supabase Storage, usando URL original');
      return imageUrl;
    }
    
    const bucketName = match[2];
    const filePath = match[3];
    
    console.log(`🔐 Gerando URL assinada para: ${bucketName}/${filePath}`);
    
    // Gerar URL assinada válida por 1 hora (3600 segundos)
    const signedUrlResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${bucketName}/${filePath}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
          'apikey': SUPABASE_SERVICE_ROLE
        },
        body: JSON.stringify({
          expiresIn: 3600 // 1 hora
        })
      }
    );
    
    if (!signedUrlResponse.ok) {
      console.error('❌ Erro ao gerar URL assinada:', await signedUrlResponse.text());
      return imageUrl; // Fallback para URL original
    }
    
    const { signedURL } = await signedUrlResponse.json();
    const fullSignedUrl = `${SUPABASE_URL}${signedURL}`;
    
    console.log(`✅ URL assinada gerada com sucesso`);
    return fullSignedUrl;
    
  } catch (error) {
    console.error('❌ Erro ao processar URL da imagem:', error.message);
    return imageUrl; // Fallback para URL original em caso de erro
  }
}

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

// Normalização para envio (com DDI)
function normalizeForSending(phone) {
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

/* ============================ PAYMENT CONFIRMATION ============================ */
/**
 * Busca o template de confirmação de pagamento para o tenant
 */
async function getPaymentTemplate() {
  try {
    console.log('📋 [TEMPLATE] Buscando template PAID_ORDER...');
    
    const templates = await supa('/whatsapp_templates?select=content&type=eq.PAID_ORDER&limit=1');
    
    if (templates && templates.length > 0) {
      console.log('✅ [TEMPLATE] Template de pagamento encontrado no banco');
      return templates[0].content;
    }
    
    console.log('⚠️ [TEMPLATE] Template não encontrado, usando padrão');
    return `🎉 *Pagamento Confirmado - Pedido #{{order_id}}*

Seu pagamento foi aprovado! ✅

💰 Valor pago: *{{total_amount}}*
📦 Status: Em preparação

Seu pedido está sendo preparado e em breve entraremos em contato com as informações de entrega.

Obrigado pela preferência! 😊`;
  } catch (error) {
    console.error('❌ [TEMPLATE] Erro ao buscar template:', error.message);
    console.error('Stack:', error.stack);
    return null;
  }
}

/**
 * Substitui as variáveis do template pelos valores reais do pedido
 */
function replaceTemplateVariables(template, order) {
  if (!template) return null;
  
  const customerName = order.customer_name || order.customer_phone;
  const totalFormatted = fmtMoney(order.total_amount);
  const dateFormatted = new Date(order.created_at).toLocaleString('pt-BR');
  
  return template
    .replace(/\{\{order_id\}\}/g, order.id)
    .replace(/\{\{customer_name\}\}/g, customerName)
    .replace(/\{\{total_amount\}\}/g, totalFormatted)
    .replace(/\{\{date\}\}/g, dateFormatted)
    .replace(/\{\{created_at\}\}/g, dateFormatted);
}

async function checkAndSendPendingPaymentConfirmations() {
  try {
    console.log('🔍 [PAYMENT] Verificando pedidos pagos sem confirmação enviada...');
    
    // Buscar template primeiro
    const template = await getPaymentTemplate();
    if (!template) {
      console.error('❌ [PAYMENT] Não foi possível carregar o template');
      return;
    }
    
    const orders = await supa('/orders?select=id,customer_phone,customer_name,total_amount,created_at&is_paid=eq.true&payment_confirmation_sent=is.null');
    
    if (!orders || orders.length === 0) {
      console.log('✅ [PAYMENT] Nenhum pedido pendente de confirmação');
      return;
    }

    console.log(`📋 [PAYMENT] Encontrados ${orders.length} pedidos pendentes de confirmação`);

    for (const order of orders) {
      try {
        console.log(`📤 [PAYMENT] Enviando confirmação para pedido #${order.id}`);
        
        const message = replaceTemplateVariables(template, order);
        
        if (!message) {
          console.error(`❌ [PAYMENT] Erro ao processar template para pedido #${order.id}`);
          continue;
        }

        const normalizedNumber = normalizeForSending(order.customer_phone);
        await client.sendMessage(`${normalizedNumber}@c.us`, message);

        await supa(`/orders?id=eq.${order.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            payment_confirmation_sent: true
          })
        });

        await supa('/whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            phone: normalizeForStorage(order.customer_phone),
            message,
            type: 'payment_confirmation',
            order_id: order.id,
            sent_at: new Date().toISOString()
          })
        });

        console.log(`✅ [PAYMENT] Confirmação enviada para pedido #${order.id}`);
        
        await delay(2000);
      } catch (error) {
        console.error(`❌ [PAYMENT] Erro ao enviar confirmação pedido #${order.id}:`, error.message);
      }
    }

    console.log(`✅ [PAYMENT] Verificação de pagamentos concluída`);
  } catch (error) {
    console.error('❌ [PAYMENT] Erro ao verificar pagamentos pendentes:', error.message);
  }
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
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
  }
});

let clientReady = false;

client.on('qr', (qr) => {
  console.log('📱 Escaneie o QR Code:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => { 
  console.log('✅ WhatsApp conectado!'); 
  clientReady = true; 
  
  // Verificar e enviar mensagens de confirmação pendentes
  await checkAndSendPendingPaymentConfirmations();
});

client.on('authenticated', () => console.log('🔑 WhatsApp autenticado!'));
client.on('auth_failure', () => console.log('❌ Falha na autenticação do WhatsApp'));

client.on('message', async (msg) => {
  try {
    // Ignorar mensagens enviadas pelo próprio bot
    if (msg.fromMe) {
      console.log('⏭️ Ignorando mensagem enviada pelo próprio bot');
      return;
    }

    let groupName = null;
    let authorPhone = null;
    let messageFrom = msg.from;
    
    console.log(`📨 Mensagem recebida para tenant ${TENANT_SLUG}:`, {
      from: msg.from,
      body: msg.body,
      hasAuthor: !!msg.author,
      isGroup: msg.from && msg.from.includes('@g.us')
    });

    // Verificar se é mensagem de grupo
    if (msg.from && msg.from.includes('@g.us')) {
      try {
        const chat = await msg.getChat();
        if (chat && chat.isGroup) {
          groupName = chat.name || 'Grupo WhatsApp';
          console.log(`📱 Grupo identificado: ${groupName}`);
          
          if (msg.author) {
            authorPhone = normalizeForStorage(msg.author.replace('@c.us', ''));
            messageFrom = msg.author;
            console.log(`👤 Autor do grupo: ${authorPhone}`);
          } else {
            console.log(`⚠️ Mensagem de grupo sem author definido`);
            return;
          }
        }
      } catch (chatError) {
        console.error('❌ Erro ao obter informações do grupo:', chatError.message);
        return;
      }
    } else {
      authorPhone = normalizeForStorage(msg.from.replace('@c.us', ''));
    }

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
          tenant_id: TENANT_ID, 
          customer_phone: normalizedPhone, 
          event_date: today, 
          event_type: 'whatsapp', 
          status: 'OPEN', 
          whatsapp_group_name: groupName
        })
      });
      cart = newCarts?.[0];
    }

    if (cart) {
      await supa('/cart_items', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: TENANT_ID, 
          cart_id: cart.id, 
          product_id: product.id, 
          qty: 1, 
          unit_price: product.price
        })
      });
      console.log(`🛒 Produto ${product.code} adicionado ao carrinho do cliente ${normalizedPhone}${groupName ? ` (grupo: ${groupName})` : ''}`);

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
    features: ['individual', 'groups', 'broadcast', 'templates', 'auto-payment', 'auto-cancel', 'auto-item-added'],
    timestamp: new Date().toISOString()
  });
});

// ===== INDIVIDUAL MESSAGING =====
app.post('/send', async (req, res) => {
  try {
    if (!clientReady) return res.status(503).json({ success: false, error: 'WhatsApp não está conectado' });
    const { number, phone, message, order_id } = req.body;
    
    const phoneNumber = number || phone;
    
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Telefone é obrigatório' });
    }

    let finalMessage = message;

    if (order_id) {
      console.log(`📋 [SEND] Buscando template e dados do pedido #${order_id}`);
      
      try {
        const template = await getPaymentTemplate();
        if (!template) {
          return res.status(500).json({ success: false, error: 'Template de pagamento não encontrado' });
        }

        const orders = await supa(`/orders?select=id,customer_phone,customer_name,total_amount,created_at&id=eq.${order_id}&limit=1`);

        if (!orders || orders.length === 0) {
          return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
        }

        const order = orders[0];
        finalMessage = replaceTemplateVariables(template, order);
        
        if (!finalMessage) {
          return res.status(500).json({ success: false, error: 'Erro ao processar template' });
        }

        console.log(`✅ [SEND] Template processado para pedido #${order_id}`);
        
      } catch (templateError) {
        console.error('❌ [SEND] Erro ao processar template:', templateError);
        return res.status(500).json({ success: false, error: 'Erro ao processar template de pagamento' });
      }
    } else if (!message) {
      return res.status(400).json({ success: false, error: 'Mensagem é obrigatória quando não há order_id' });
    }

    console.log('📤 [SEND] Enviando mensagem:', { 
      phone: normalizeForStorage(phoneNumber), 
      order_id,
      messageLength: finalMessage.length 
    });

    const normalizedNumber = normalizeForSending(phoneNumber);
    await client.sendMessage(`${normalizedNumber}@c.us`, finalMessage);

    const messageData = {
      tenant_id: TENANT_ID, 
      phone: normalizeForStorage(phoneNumber), 
      message: finalMessage, 
      type: order_id ? 'payment_confirmation' : 'outgoing',
      sent_at: new Date().toISOString()
    };
    
    if (order_id) {
      messageData.order_id = order_id;
    }

    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify(messageData)
    });

    if (order_id) {
      await supa(`/orders?id=eq.${order_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          payment_confirmation_sent: true
        })
      });
      console.log(`✅ [SEND] Confirmação marcada para pedido #${order_id}`);
    }

    console.log('✅ [SEND] Mensagem enviada com sucesso');
    res.json({ success: true, phone: normalizeForStorage(phoneNumber) });
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem individual:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== PRODUCT CANCELED =====
app.post('/send-product-canceled', async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    const { phone, product_name, product_code } = req.body;
    
    if (!phone || !product_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Telefone e nome do produto são obrigatórios' 
      });
    }

    console.log('🗑️ [CANCEL] Enviando mensagem de produto cancelado:', { 
      phone, 
      product_name, 
      product_code 
    });

    const template = await getTemplate('PRODUCT_CANCELED');
    let message;
    
    if (template) {
      message = replaceVariables(template.content, {
        produto: product_name,
        codigo: product_code || ''
      });
    } else {
      const codeText = product_code ? ` (${product_code})` : '';
      message = `❌ *Produto Cancelado*\n\nO produto "${product_name}"${codeText} foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.`;
    }

    const normalizedNumber = normalizeForSending(phone);
    await client.sendMessage(`${normalizedNumber}@c.us`, message);

    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        phone: normalizeForStorage(phone),
        message,
        type: 'product_canceled',
        product_name: product_name,
        sent_at: new Date().toISOString()
      })
    });

    console.log('✅ [CANCEL] Mensagem de cancelamento enviada');
    res.json({ 
      success: true, 
      phone: normalizeForStorage(phone),
      product_name 
    });

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem de produto cancelado:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ===== TEST SEND =====
app.post('/test-send', async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Telefone é obrigatório' 
      });
    }

    console.log('🧪 [TEST] Enviando mensagem de teste para:', phone);

    const message = `🧪 *Teste de Conexão WhatsApp*\n\nOlá! Este é um teste de envio automático.\n\n✅ Seu WhatsApp está conectado e funcionando!\n\nServidor: ${TENANT_SLUG}\nData/Hora: ${new Date().toLocaleString('pt-BR')}`;

    const normalizedNumber = normalizeForSending(phone);
    await client.sendMessage(`${normalizedNumber}@c.us`, message);

    console.log('✅ [TEST] Mensagem de teste enviada');
    res.json({ 
      success: true, 
      phone: normalizeForStorage(phone),
      message: 'Mensagem de teste enviada com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem de teste:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ===== ADD LABEL =====
app.post('/add-label', async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    const { phone, label } = req.body;
    
    if (!phone || !label) {
      return res.status(400).json({ 
        success: false, 
        error: 'Telefone e label são obrigatórios' 
      });
    }

    console.log('🏷️ [LABEL] Adicionando label:', { phone, label });

    const normalizedNumber = normalizeForSending(phone);
    const chatId = `${normalizedNumber}@c.us`;
    
    const chat = await client.getChatById(chatId);
    
    if (!chat) {
      return res.status(404).json({ 
        success: false, 
        error: 'Chat não encontrado' 
      });
    }

    const labels = await client.getLabels();
    let targetLabel = labels.find(l => l.name === label);
    
    if (!targetLabel) {
      console.log(`🏷️ [LABEL] Label "${label}" não encontrada`);
      return res.status(404).json({ 
        success: false, 
        error: `Label "${label}" não encontrada. Crie a label manualmente no WhatsApp primeiro.`
      });
    }

    await chat.addLabel(targetLabel.id);

    console.log('✅ [LABEL] Label adicionada com sucesso');
    res.json({ 
      success: true, 
      phone: normalizeForStorage(phone),
      label 
    });

  } catch (error) {
    console.error('❌ Erro ao adicionar label:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ===== SEND ITEM ADDED =====
app.post('/send-item-added', async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    const { phone, product_id, quantity } = req.body;
    
    if (!phone || !product_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Telefone e ID do produto são obrigatórios' 
      });
    }

    console.log('🛒 [ITEM-ADDED] Enviando mensagem de item adicionado:', { 
      phone, 
      product_id,
      quantity 
    });

    // Buscar dados do produto no banco
    const products = await supa(`/products?select=*&id=eq.${product_id}&limit=1`);
    
    if (!products || products.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Produto não encontrado' 
      });
    }

    const product = products[0];
    console.log('📦 [ITEM-ADDED] Produto encontrado:', product.name, product.code);

    // Buscar template e compor mensagem
    const template = await getTemplate('ITEM_ADDED');
    let message;
    
    if (template) {
      const qty = quantity || 1;
      const totalPrice = product.price * qty;
      
      message = replaceVariables(template.content, {
        produto: product.name,
        codigo: product.code || '',
        quantidade: qty.toString(),
        preco: fmtMoney(product.price),
        total: fmtMoney(totalPrice)
      });
    } else {
      // Mensagem padrão se não houver template
      const productCode = product.code ? ` (${product.code})` : '';
      const price = fmtMoney(product.price);
      const qty = quantity || 1;
      message = `🛒 *Item adicionado ao pedido*\n\n✅ ${product.name}${productCode}\nQtd: *${qty}*\nPreço: *${price}*`;
    }

    const normalizedNumber = normalizeForSending(phone);
    await client.sendMessage(`${normalizedNumber}@c.us`, message);

    // Salvar no histórico
    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        phone: normalizeForStorage(phone),
        message,
        type: 'item_added',
        product_name: product.name,
        sent_at: new Date().toISOString()
      })
    });

    console.log('✅ [ITEM-ADDED] Mensagem de item adicionado enviada');
    res.json({ 
      success: true, 
      phone: normalizeForStorage(phone),
      product_name: product.name 
    });

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem de item adicionado:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ===== GROUP MESSAGING =====
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
      console.log(`🖼️ Processando imagem: ${imageUrl}`);
      try {
        // Gerar URL assinada se for do Supabase Storage
        const finalImageUrl = await getSignedImageUrl(imageUrl);
        console.log(`🔗 URL final para download: ${finalImageUrl.substring(0, 80)}...`);
        
        // Tentar baixar a imagem com timeout e unsafeMime
        console.log('📥 Baixando imagem...');
        const media = await MessageMedia.fromUrl(finalImageUrl, { 
          unsafeMime: true,
          timeout: 45000 // 45 segundos
        });
        
        console.log(`✅ Imagem baixada (${media.mimetype}), enviando com caption...`);
        result = await client.sendMessage(groupId, media, { caption: message });
        console.log('✅ Imagem + Caption enviados com sucesso');
      } catch (imageError) {
        console.error('❌ Erro ao processar imagem:', imageError.message);
        console.log('📝 Enviando apenas texto como fallback...');
        // Fallback: enviar apenas texto se imagem falhar
        result = await client.sendMessage(groupId, message);
        console.log(`✅ Texto enviado (sem imagem - fallback)`);
      }
    } else {
      console.log('📝 Enviando apenas texto...');
      result = await client.sendMessage(groupId, message);
      console.log('✅ Texto enviado com sucesso');
    }

    console.log(`✅ Mensagem enviada com sucesso para ${group.name}`);

    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID, 
        phone: groupId,
        message: message,
        type: 'broadcast',
        sent_at: new Date().toISOString(),
        whatsapp_group_name: group.name
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

app.get('/group/:groupId/participants', async (req, res) => {
  console.log('👥 Requisição para listar participantes do grupo');
  
  try {
    if (!clientReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não está conectado' 
      });
    }

    const { groupId } = req.params;
    
    if (!groupId) {
      return res.status(400).json({ 
        error: 'Group ID é obrigatório' 
      });
    }

    console.log(`🔍 Buscando participantes do grupo: ${groupId}`);
    
    const chats = await client.getChats();
    const group = chats.find(chat => chat.id._serialized === groupId && chat.isGroup);
    
    if (!group) {
      return res.status(404).json({ 
        success: false,
        error: 'Grupo não encontrado',
        groupId: groupId
      });
    }

    const participants = group.participants.map(participant => ({
      id: participant.id._serialized,
      phone: normalizeForStorage(participant.id._serialized.replace('@c.us', '')),
      isAdmin: participant.isAdmin,
      isSuperAdmin: participant.isSuperAdmin
    }));

    console.log(`✅ Participantes encontrados: ${participants.length}`);
    
    res.json({
      success: true,
      groupId: groupId,
      groupName: group.name,
      participants: participants,
      total: participants.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar participantes:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: 'Erro ao buscar participantes do grupo'
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

    if (key !== 'whatsapp-broadcast-2024') {
      return res.status(403).json({ error: 'Chave de broadcast inválida' });
    }

    if (!message || !status) {
      return res.status(400).json({ error: 'Mensagem e status são obrigatórios' });
    }

    console.log(`📊 Filtros: Status=${status}, Data Inicial=${startDate || 'N/A'}, Data Final=${endDate || 'N/A'}`);

    let query = '/orders?select=customer_phone,customer_name';
    
    if (status === 'paid') {
      query += '&is_paid=eq.true';
    } else if (status === 'unpaid') {
      query += '&is_paid=eq.false';
    }

    if (startDate) {
      query += `&created_at=gte.${startDate}T00:00:00`;
    }
    if (endDate) {
      query += `&created_at=lte.${endDate}T23:59:59`;
    }

    console.log(`🔍 Query Supabase: ${query}`);

    const orders = await supa(query);
    
    if (!orders || orders.length === 0) {
      console.log('⚠️  Nenhum pedido encontrado com os filtros especificados');
      return res.json({ 
        success: true, 
        total: 0, 
        message: 'Nenhum pedido encontrado com os filtros especificados' 
      });
    }

    const uniquePhones = [...new Set(orders.map(o => o.customer_phone).filter(Boolean))];
    console.log(`📱 Total de números únicos encontrados: ${uniquePhones.length}`);

    if (uniquePhones.length === 0) {
      return res.json({ 
        success: true, 
        total: 0, 
        message: 'Nenhum telefone válido encontrado' 
      });
    }

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
console.log('🚀 Iniciando servidor WhatsApp UNIFICADO...');
console.log(`📍 Tenant: ${TENANT_SLUG} (${TENANT_ID})`);

client.initialize();

app.listen(PORT, () => {
  console.log(`\n🌐 ═══════════════════════════════════════════════`);
  console.log(`🌐 Servidor UNIFICADO rodando na porta ${PORT}`);
  console.log(`🌐 ═══════════════════════════════════════════════`);
  console.log(`📋 Status: http://localhost:${PORT}/status`);
  console.log(`\n📤 ROTAS DISPONÍVEIS:`);
  console.log(`   POST /send - Enviar mensagem individual`);
  console.log(`   POST /send-item-added - Enviar item adicionado`);
  console.log(`   POST /send-product-canceled - Enviar cancelamento`);
  console.log(`   POST /test-send - Enviar teste`);
  console.log(`   POST /add-label - Adicionar etiqueta`);
  console.log(`   GET  /list-all-groups - Listar grupos`);
  console.log(`   POST /send-to-group - Enviar para grupo`);
  console.log(`   GET  /group/:id/participants - Listar participantes`);
  console.log(`   POST /api/broadcast/orders - Broadcast por pedidos`);
  console.log(`\n✅ Servidor pronto! Aguardando conexão WhatsApp...`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  if (clientReady) await client.destroy();
  process.exit();
});
