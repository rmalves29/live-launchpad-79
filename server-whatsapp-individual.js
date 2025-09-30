/**
 * server-whatsapp-individual.js — Servidor WhatsApp por empresa
 * Baseado no server-whatsapp.js original mas com suporte completo a templates
 * Uso: node server-whatsapp-individual.js
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

// fetch (fallback para ambientes sem global)
if (typeof fetch !== 'function') {
  global.fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
}

/* ============================ CONFIG ============================ */
const PORT = process.env.PORT || 3333;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_ROLE) {
  console.error('❌ [FATAL] SUPABASE_SERVICE_ROLE (ou SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY) não configurado. Configure a service role para evitar erros 401/42501 (RLS).');
  process.exit(1);
}

const SUPABASE_KEY = SUPABASE_SERVICE_ROLE;

// Configuração do tenant (definir manualmente para cada empresa)
const TENANT_ID = process.env.TENANT_ID || '08f2b1b9-3988-489e-8186-c60f0c0b0622';
const TENANT_SLUG = process.env.TENANT_SLUG || 'app';

const USING_SERVICE_ROLE = true;

console.log(`🏢 Inicializando servidor para tenant: ${TENANT_SLUG} (${TENANT_ID})`);
console.log(`🔐 Modo Supabase: service_role (RLS ignorada no servidor)`);

// Diagnóstico rápido do token (não imprime o token, só o claim)
try {
  const payload = (SUPABASE_KEY || '').split('.')[1];
  const claims = payload ? JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) : null;
  console.log(`🧪 JWT role: ${claims?.role || 'N/A'} | exp: ${claims?.exp ? new Date(claims.exp * 1000).toISOString() : 'n/a'}`);
} catch (e) {
  console.log('⚠️ Não foi possível decodificar o JWT de SUPABASE_SERVICE_ROLE.');
}

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function fmtMoney(v) { 
  return `R$ ${Number(v||0).toFixed(2).replace('.', ',')}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

// Normalização para envio (com DDI) - renomeando a função original
function normalizeForSending(phone) {
  if (!phone) return phone;
  
  const cleanPhone = phone.replace(/\D/g, '');
  let normalizedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  
  if (normalizedPhone.length >= 4) {
    const ddd = parseInt(normalizedPhone.substring(2, 4));
    const restOfNumber = normalizedPhone.substring(4);
    
    if (ddd < 31 && !restOfNumber.startsWith('9') && restOfNumber.length === 8) {
      normalizedPhone = normalizedPhone.substring(0, 4) + '9' + normalizedPhone.substring(4);
    }
    else if (ddd >= 31 && restOfNumber.startsWith('9') && restOfNumber.length === 9) {
      normalizedPhone = normalizedPhone.substring(0, 4) + normalizedPhone.substring(5);
    }
  }
  
  return normalizedPhone;
}

// Manter compatibilidade - usar nova função
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
  if (!res.ok) throw new Error(`Supabase ${res.status} ${pathname} ${text}`);
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
  if (now - templatesCacheTime > 300000) { // 5 minutos
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
  
  // Fallback
  const productCode = product.code ? ` (${product.code})` : '';
  const price = fmtMoney(product.price);
  return `🛒 *Item adicionado ao pedido*\n\n✅ ${product.name}${productCode}\nQtd: *1*\nPreço: *${price}*`;
}

/* ============================ PAYMENT CONFIRMATION ============================ */
async function getPaymentTemplate() {
  try {
    console.log('📋 [TEMPLATE] Buscando template PAID_ORDER...');
    
    const templates = await supa('/whatsapp_templates?select=content&type=eq.PAID_ORDER&limit=1');
    
    if (templates && templates.length > 0) {
      console.log('✅ [TEMPLATE] Template personalizado encontrado');
      return templates[0].content;
    }
    
    console.log('⚠️ [TEMPLATE] Nenhum template encontrado, usando padrão');
    return `🎉 *Pagamento Confirmado!*

Olá {customer_name}!

✅ Seu pagamento foi confirmado com sucesso!
📄 Pedido: #{order_id}
💰 Valor: {total_amount}
📅 Data: {created_at}

Seu pedido já está sendo preparado! 📦

Obrigado pela preferência! 😊`;
  } catch (error) {
    console.error('❌ [TEMPLATE] Erro ao buscar template:', error.message);
    return null;
  }
}

function replaceTemplateVariables(template, order) {
  if (!template || !order) return null;
  
  const customerName = order.customer_name || order.customer_phone || 'Cliente';
  const formattedDate = order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  
  return template
    .replace(/{customer_name}/g, customerName)
    .replace(/{order_id}/g, order.id)
    .replace(/{total_amount}/g, formatCurrency(order.total_amount))
    .replace(/{created_at}/g, formattedDate);
}

async function checkAndSendPendingPaymentConfirmations() {
  try {
    console.log('💰 [PAYMENT] Verificando pedidos pagos sem confirmação...');
    
    // Buscar template primeiro
    const template = await getPaymentTemplate();
    if (!template) {
      console.error('❌ [PAYMENT] Template não disponível, abortando envio');
      return;
    }
    
    // Buscar pedidos pagos que não tiveram confirmação enviada
    const orders = await supa('/orders?select=id,customer_phone,customer_name,total_amount,created_at&is_paid=eq.true&payment_confirmation_sent=is.null&order=created_at.desc');
    
    if (!orders || orders.length === 0) {
      console.log('✅ [PAYMENT] Nenhum pedido pendente de confirmação');
      return;
    }
    
    console.log(`📨 [PAYMENT] Encontrados ${orders.length} pedidos para enviar confirmação`);
    
    for (const order of orders) {
      try {
        console.log(`📤 [PAYMENT] Enviando confirmação para pedido #${order.id}`);
        
        // Substituir variáveis no template
        const message = replaceTemplateVariables(template, order);
        
        if (!message) {
          console.error(`❌ [PAYMENT] Erro ao processar template para pedido #${order.id}`);
          continue;
        }

        const normalizedPhone = normalizeForSending(order.customer_phone);
        const chatId = `${normalizedPhone}@c.us`;
        
        // Enviar mensagem
        await client.sendMessage(chatId, message);
        console.log(`✅ [PAYMENT] Mensagem enviada para ${normalizedPhone}`);
        
        // Atualizar order como confirmação enviada
        await supaRaw(`/orders?id=eq.${order.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            payment_confirmation_sent: true
          })
        });
        
        // Registrar no log de mensagens
        await supa('/whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            phone: normalizeForStorage(order.customer_phone),
            message: message,
            type: 'payment_confirmation',
            order_id: order.id,
            sent_at: new Date().toISOString()
          })
        });
        
        console.log(`💾 [PAYMENT] Pedido #${order.id} marcado como confirmação enviada`);
        
        // Delay entre mensagens
        await delay(2000);
        
      } catch (orderError) {
        console.error(`❌ [PAYMENT] Erro ao processar pedido #${order.id}:`, orderError);
      }
    }
    
    console.log('✅ [PAYMENT] Verificação de pagamentos concluída');
    
  } catch (error) {
    console.error('❌ [PAYMENT] Erro ao verificar pagamentos pendentes:', error);
  }
}

/* ============================ WHATSAPP CLIENT ============================ */
const client = new Client({
  authStrategy: new LocalAuth({ clientId: TENANT_SLUG }),
  puppeteer: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
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
  
  // Verificar pedidos pagos pendentes de confirmação
  try {
    await checkAndSendPendingPaymentConfirmations();
  } catch (error) {
    console.error('❌ Erro ao verificar confirmações pendentes:', error);
  }
});

client.on('authenticated', () => {
  console.log('🔑 WhatsApp autenticado!');
});

client.on('auth_failure', () => {
  console.log('❌ Falha na autenticação do WhatsApp');
});

client.on('message', async (msg) => {
  try {
    console.log(`📨 Mensagem recebida de ${msg.from}: ${msg.body}`);
    
    // Salvar mensagem no banco
    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        phone: normalizeForStorage(msg.from),
        message: msg.body,
        type: 'incoming',
        received_at: new Date().toISOString()
      })
    });

    // Detectar códigos de produto
    const text = String(msg.body || '').trim().toUpperCase();
    const match = text.match(/^(?:[CPA]\s*)?(\d{1,6})$/);
    
    if (match) {
      const numeric = match[1];
      const candidates = [`C${numeric}`, `P${numeric}`, `A${numeric}`, numeric];

      // Buscar produto
      const products = await supa(`/products?select=*&is_active=eq.true&code=in.(${candidates.map(c => `"${c}"`).join(',')})`);
      const product = products[0];

      if (product) {
        console.log(`🎯 Produto encontrado: ${product.name} (${product.code})`);
        
        // Processar pedido automaticamente
        await processProductCode(msg.from, product);
        
        // Enviar confirmação
        const message = await composeItemAdded(product);
        await client.sendMessage(msg.from, message);
        console.log(`✅ Confirmação enviada para ${msg.from}`);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
  }
});

async function processProductCode(phone, product) {
  const normalizedPhone = normalizeForStorage(phone);
  const today = new Date().toISOString().split('T')[0];

  try {
    // Buscar ou criar cliente
    let customers = await supa(`/customers?select=*&phone=eq.${normalizedPhone}`);
    let customer = customers[0];

    if (!customer) {
      const newCustomers = await supa('/customers', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          phone: normalizedPhone,
          name: normalizedPhone
        })
      });
      customer = newCustomers[0];
    }

    // Buscar ou criar carrinho aberto
    let carts = await supa(`/carts?select=*&customer_phone=eq.${normalizedPhone}&event_date=eq.${today}&status=eq.OPEN`);
    let cart = carts[0];

    if (!cart) {
      const newCarts = await supa('/carts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          customer_phone: normalizedPhone,
          event_date: today,
          event_type: 'whatsapp',
          status: 'OPEN'
        })
      });
      cart = newCarts[0];
    }

    // Adicionar item ao carrinho
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

      console.log(`🛒 Produto ${product.code} adicionado ao carrinho do cliente ${normalizedPhone}`);
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
    timestamp: new Date().toISOString()
  });
});

app.post('/send', async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({ error: 'WhatsApp não está conectado' });
    }

    const { number, phone, message, order_id } = req.body;
    
    // Aceita tanto 'number' quanto 'phone' para compatibilidade
    const phoneNumber = number || phone;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Telefone é obrigatório' });
    }

    let finalMessage = message;

    // Se tem order_id, buscar template e dados do pedido
    if (order_id) {
      console.log(`📋 [SEND] Buscando template e dados do pedido #${order_id}`);
      
      try {
        // Buscar template
        const template = await getPaymentTemplate();
        if (!template) {
          return res.status(500).json({ error: 'Template de pagamento não encontrado' });
        }

        // Buscar dados do pedido
        const orders = await supa(`/orders?select=id,customer_phone,customer_name,total_amount,created_at&id=eq.${order_id}&limit=1`);

        if (!orders || orders.length === 0) {
          return res.status(404).json({ error: 'Pedido não encontrado' });
        }

        const order = orders[0];
        
        // Montar mensagem com template
        finalMessage = replaceTemplateVariables(template, order);
        
        if (!finalMessage) {
          return res.status(500).json({ error: 'Erro ao processar template' });
        }

        console.log(`✅ [SEND] Template processado para pedido #${order_id}`);
        
      } catch (templateError) {
        console.error('❌ [SEND] Erro ao processar template:', templateError);
        return res.status(500).json({ error: 'Erro ao processar template de pagamento' });
      }
    } else if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória quando não há order_id' });
    }

    const normalizedNumber = normalizeForSending(phoneNumber);
    console.log(`📤 [SEND] Enviando mensagem para ${normalizedNumber}`);
    await client.sendMessage(`${normalizedNumber}@c.us`, finalMessage);

    // Log da mensagem enviada
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

    // Se for confirmação de pagamento, marcar no pedido
    if (order_id) {
      await supaRaw(`/orders?id=eq.${order_id}`, {
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
    console.error('❌ Erro ao enviar mensagem:', error);
    res.status(500).json({ error: error.message });
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
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  if (clientReady) {
    await client.destroy();
  }
  process.exit();
});

console.log('\n📖 INSTRUÇÕES DE USO:');
console.log('1. Execute: node server-whatsapp-individual.js');
console.log('2. Escaneie o QR Code que aparecerá');
console.log('3. Aguarde a mensagem "WhatsApp conectado!"');
console.log('4. Envie códigos de produto via WhatsApp para testar');
console.log('\n✅ Sistema pronto para detectar códigos automaticamente!');
