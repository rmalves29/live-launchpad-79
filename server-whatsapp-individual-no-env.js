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

/**
 * NORMALIZAÇÃO CORRIGIDA - Garante 9º dígito para celulares
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove tudo que não é número
  let clean = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  if (clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Valida tamanho (deve ter 10 ou 11 dígitos: DDD + número)
  if (clean.length < 10 || clean.length > 11) {
    console.warn(`⚠️ Telefone com tamanho inválido: ${phone} (${clean.length} dígitos)`);
    return clean;
  }
  
  // Valida DDD (11-99)
  const ddd = parseInt(clean.substring(0, 2));
  if (ddd < 11 || ddd > 99) {
    console.warn(`⚠️ DDD inválido: ${ddd}`);
    return clean;
  }
  
  // REGRA POR DDD:
  // DDD ≤ 30: adiciona 9º dígito se tiver 10 dígitos
  // DDD ≥ 31: remove 9º dígito se tiver 11 dígitos
  if (ddd <= 30) {
    // DDDs antigos (≤30): garantir 9º dígito
    if (clean.length === 10 && clean[2] !== '9') {
      clean = clean.substring(0, 2) + '9' + clean.substring(2);
      console.log(`✅ 9º dígito adicionado (DDD ≤30): ${phone} -> ${clean}`);
    }
  } else {
    // DDDs novos (≥31): remover 9º dígito se existir
    if (clean.length === 11 && clean[2] === '9') {
      clean = clean.substring(0, 2) + clean.substring(3);
      console.log(`✅ 9º dígito removido (DDD ≥31): ${phone} -> ${clean}`);
    }
  }
  
  return clean;
}

// Para armazenamento no banco (sem DDI)
function normalizeForStorage(phone) {
  return normalizePhoneNumber(phone);
}

// Para envio no WhatsApp (com DDI 55)
function normalizeForSending(phone) {
  const normalized = normalizePhoneNumber(phone);
  return '55' + normalized;
}

// Mantém compatibilidade com código antigo
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

async function composeFinalize() {
  const template = await getTemplate('FINALIZAR');
  if (template) return template.content;
  return (
    'Perfeita a sua escolha! 💖 Já deixei separada.\n' +
    'Para pagar agora: clique no link, coloque o seu telefone.\n' +
    '👉 https://app.orderzaps.com/checkout'
  );
}

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
    headless: false,  // 🖥️ ABRE O NAVEGADOR VISÍVEL
    devtools: false,   // DevTools desabilitado para não atrapalhar
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--start-maximized',  // Abre maximizado
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

let clientReady = false;
let clientState = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, AUTHENTICATED, READY

client.on('qr', (qr) => {
  console.log('📱 ========================================');
  console.log('📱 ESCANEIE O QR CODE ABAIXO:');
  console.log('📱 ========================================');
  qrcode.generate(qr, { small: true });
  console.log('📱 ========================================');
  clientState = 'CONNECTING';
});

client.on('authenticated', () => {
  console.log('🔑 WhatsApp autenticado com sucesso!');
  clientState = 'AUTHENTICATED';
});

client.on('ready', async () => { 
  console.log('✅ ========================================');
  console.log('✅ WhatsApp CONECTADO E PRONTO!'); 
  console.log('✅ ========================================');
  clientReady = true;
  clientState = 'READY';
  
  // Aguarda estabilização da conexão
  await delay(3000);
  console.log('✅ Cliente estabilizado e pronto para enviar mensagens');
});

client.on('auth_failure', (msg) => {
  console.error('❌ ========================================');
  console.error('❌ FALHA NA AUTENTICAÇÃO DO WHATSAPP');
  console.error('❌', msg);
  console.error('❌ ========================================');
  clientState = 'DISCONNECTED';
  clientReady = false;
});

client.on('disconnected', (reason) => {
  console.error('❌ ========================================');
  console.error('❌ WhatsApp DESCONECTADO');
  console.error('❌ Motivo:', reason);
  console.error('❌ ========================================');
  clientState = 'DISCONNECTED';
  clientReady = false;
});

// Listener para ACK de mensagens
client.on('message_ack', (msg, ack) => {
  const ackStates = {
    0: 'ENVIANDO (erro)',
    1: 'ENVIADA ao servidor',
    2: 'RECEBIDA pelo dispositivo',
    3: 'LIDA pelo destinatário',
    4: 'REPRODUZIDA (áudio/vídeo)'
  };
  console.log(`📬 ACK Mensagem ${msg.id._serialized}: ${ackStates[ack] || ack}`);
});

client.on('message', async (msg) => {
  try {
    let groupName = null;
    let authorPhone = null;
    let messageFrom = msg.from;
    
    console.log(`📨 Mensagem recebida:`, {
      from: msg.from,
      body: msg.body?.substring(0, 50),
      isGroup: msg.from?.includes('@g.us')
    });

    // Verificar se é mensagem de grupo
    if (msg.from && msg.from.includes('@g.us')) {
      try {
        const chat = await msg.getChat();
        if (chat && chat.isGroup) {
          groupName = chat.name || 'Grupo WhatsApp';
          console.log(`📱 Grupo: ${groupName}`);
          
          if (msg.author) {
            authorPhone = normalizeForStorage(msg.author.replace('@c.us', ''));
            messageFrom = msg.author;
            console.log(`👤 Autor: ${authorPhone}`);
          } else {
            console.log(`⚠️ Mensagem de grupo sem author`);
            return;
          }
        }
      } catch (chatError) {
        console.error('❌ Erro ao obter info do grupo:', chatError.message);
      }
    } else {
      authorPhone = normalizeForStorage(msg.from.replace('@c.us', ''));
    }

    if (!authorPhone) {
      console.log(`⚠️ Telefone inválido, ignorando mensagem`);
      return;
    }

    // Webhook
    const webhookPayload = {
      from: messageFrom,
      body: msg.body || '',
      groupName: groupName,
      author: authorPhone,
      chatName: groupName
    };

    try {
      const webhookUrl = `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-multitenant/${TENANT_ID}`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      });

      if (response.ok) {
        console.log(`✅ Webhook enviado: ${response.status}`);
      }
    } catch (webhookError) {
      console.error('❌ Erro webhook:', webhookError.message);
    }
    
    // Salvar no banco
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
      console.error('❌ Erro ao salvar:', dbError.message);
    }

    const text = String(msg.body || '').trim().toUpperCase();
    
    // Comando FINALIZAR
    if (text === 'FINALIZAR') {
      const message = await composeFinalize();
      await client.sendMessage(messageFrom, message);
      console.log(`✅ FINALIZAR enviado`);
      return;
    }
    
    // Detecção de código de produto
    const match = text.match(/^(?:[CPA]\s*)?(\d{1,6})$/);
    
    if (match) {
      const numeric = match[1];
      const candidates = [`C${numeric}`, `P${numeric}`, `A${numeric}`, numeric];
      console.log(`🔍 Buscando produto:`, candidates);
      
      const products = await supa(`/products?select=*&is_active=eq.true&code=in.(${candidates.map(c => `"${c}"`).join(',')})`);
      
      const product = products?.[0];
      if (product) {
        console.log(`📦 Produto: ${product.name} (${product.code})`);
        await processProductCode(authorPhone, product, groupName);
        const message = await composeItemAdded(product);
        await client.sendMessage(messageFrom, message);
        console.log(`✅ Confirmação enviada`);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
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
      console.log(`🧾 Pedido criado: #${order?.id} (${fmtMoney(total)})`);
    } else {
      await supa(`/orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ total_amount: total })
      });
      console.log(`🧾 Pedido atualizado: #${order.id} (${fmtMoney(total)})`);
    }

    return order;
  } catch (err) {
    console.error('❌ Erro pedido:', err);
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
      console.log(`🛒 Produto ${product.code} adicionado ao carrinho`);

      await upsertOrderForCart(cart, normalizedPhone, today);
    }
  } catch (error) {
    console.error('❌ Erro processar produto:', error);
    throw error;
  }
}

/* ============================ ENVIO COM RETRY E ACK ============================ */
async function sendWhatsAppMessageWithRetry(phone, message, maxRetries = 3) {
  console.log(`📤 ========================================`);
  console.log(`📤 INICIANDO ENVIO DE MENSAGEM`);
  console.log(`📤 Para: ${phone}`);
  console.log(`📤 Status cliente: ${clientState} | Ready: ${clientReady}`);
  console.log(`📤 ========================================`);

  // VERIFICAÇÃO CRÍTICA: Cliente precisa estar READY, não apenas CONNECTED
  if (!clientReady) {
    throw new Error(`❌ WhatsApp não está pronto! clientReady: ${clientReady}`);
  }
  
  if (clientState !== 'READY') {
    throw new Error(`❌ WhatsApp não está no estado READY! Estado atual: ${clientState}`);
  }

  const normalizedPhone = normalizeForSending(phone);
  const chatId = `${normalizedPhone}@c.us`;
  
  console.log(`📞 Telefone normalizado: ${phone} -> ${normalizedPhone}`);
  console.log(`💬 Chat ID: ${chatId}`);
  console.log(`📝 Mensagem (${message.length} chars): ${message.substring(0, 100)}...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Tentativa ${attempt}/${maxRetries} de envio...`);
      
      // Dupla verificação: estado interno do Puppeteer
      const state = await client.getState();
      console.log(`📡 Estado atual do Puppeteer: ${state}`);
      
      if (state !== 'CONNECTED') {
        throw new Error(`Cliente Puppeteer não está conectado. Estado: ${state}`);
      }

      // Verifica se o número existe no WhatsApp
      console.log(`🔍 Verificando se o número ${normalizedPhone} existe no WhatsApp...`);
      const isRegistered = await client.isRegisteredUser(chatId);
      if (!isRegistered) {
        throw new Error(`❌ Número ${normalizedPhone} NÃO está registrado no WhatsApp!`);
      }
      console.log(`✅ Número verificado: está registrado no WhatsApp`);

      // Aguardar confirmação de entrega via eventos
      let messageAckReceived = false;
      let finalAck = -1;
      
      const ackHandler = (msg, ack) => {
        try {
          if (msg.to === chatId) {
            console.log(`📬 [EVENT] ACK recebido para ${chatId}: ${ack}`);
            messageAckReceived = true;
            finalAck = ack;
          }
        } catch (err) {
          console.error('Erro no ackHandler:', err);
        }
      };

      // Registrar listener ANTES de enviar
      client.on('message_ack', ackHandler);

      // Envia a mensagem
      console.log(`📨 Enviando mensagem...`);
      const result = await client.sendMessage(chatId, message);
      
      console.log(`✅ Mensagem aceita pelo servidor WhatsApp`);
      console.log(`📬 ID: ${result.id?._serialized || 'N/A'}`);
      console.log(`⏰ Timestamp: ${result.timestamp || 'N/A'}`);
      
      // Aguardar ACK por até 15 segundos
      console.log(`⏳ Aguardando confirmação de entrega (até 15s)...`);
      let waitedTime = 0;
      const checkInterval = 500;
      const maxWaitTime = 15000;
      
      while (!messageAckReceived && waitedTime < maxWaitTime) {
        await delay(checkInterval);
        waitedTime += checkInterval;
        
        // Log de progresso a cada 3 segundos
        if (waitedTime % 3000 === 0) {
          console.log(`⏳ Aguardando... ${waitedTime/1000}s`);
        }
      }
      
      // Remover listener
      client.off('message_ack', ackHandler);
      
      // Verificar resultado
      if (messageAckReceived) {
        console.log(`✅ Confirmação recebida! ACK final: ${finalAck}`);
        // ACK: -1=erro, 0=clock, 1=sent, 2=received, 3=read, 4=played
        
        if (finalAck === -1) {
          throw new Error('Mensagem rejeitada pelo WhatsApp (ACK=-1)');
        } else if (finalAck === 0) {
          console.warn(`⚠️ Mensagem pendente (ACK=0 - relógio), mas aceita pelo servidor`);
        } else {
          console.log(`✅ Mensagem CONFIRMADA como ${finalAck === 1 ? 'enviada' : finalAck === 2 ? 'recebida' : 'lida'}!`);
        }
      } else {
        console.warn(`⚠️ Nenhum ACK recebido em ${maxWaitTime/1000}s - Possível problema:`);
        console.warn(`   1. Rate limiting do WhatsApp (muitas mensagens)`);
        console.warn(`   2. Número bloqueou seu WhatsApp`);
        console.warn(`   3. Problema de conexão intermitente`);
        console.warn(`   4. WhatsApp pode estar marcando como spam`);
      }

      console.log(`✅ ========================================`);
      console.log(`✅ ENVIO CONCLUÍDO!`);
      console.log(`✅ ACK Recebido: ${messageAckReceived ? 'SIM' : 'NÃO'}`);
      console.log(`✅ ACK Status: ${finalAck}`);
      console.log(`✅ ========================================`);

      // Salva no banco
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
      console.log(`💾 Registro salvo no banco`);

      return { 
        success: true, 
        phone: normalizeForStorage(phone), 
        messageId: result.id?._serialized,
        ackReceived: messageAckReceived,
        ackStatus: finalAck
      };

    } catch (error) {
      console.error(`❌ Tentativa ${attempt} falhou:`, error.message);
      
      if (attempt < maxRetries) {
        const waitTime = attempt * 3000; // 3s, 6s, 9s...
        console.log(`⏳ Aguardando ${waitTime}ms antes de tentar novamente...`);
        await delay(waitTime);
        
        // Revalidar estado do cliente antes de retry
        console.log(`🔄 Revalidando estado do cliente...`);
        const currentState = await client.getState();
        console.log(`📡 Estado após falha: ${currentState}`);
        
        if (currentState !== 'CONNECTED') {
          console.error(`❌ Cliente desconectou! Não é possível fazer retry. Estado: ${currentState}`);
          throw new Error(`Cliente desconectou durante envio. Estado: ${currentState}`);
        }
      } else {
        console.error(`❌ ========================================`);
        console.error(`❌ FALHA TOTAL APÓS ${maxRetries} TENTATIVAS`);
        console.error(`❌ Erro: ${error.message}`);
        console.error(`❌ ========================================`);
        throw error;
      }
    }
  }
}

/* ============================ EXPRESS API ============================ */
const app = express();
app.use(express.json());
app.use(cors());

app.get('/status', async (req, res) => {
  let puppeteerState = 'UNKNOWN';
  let canSendMessages = false;
  
  try {
    if (clientReady) {
      puppeteerState = await client.getState();
      // Só pode enviar se estiver READY internamente E CONNECTED no Puppeteer
      canSendMessages = clientReady && clientState === 'READY' && puppeteerState === 'CONNECTED';
    }
  } catch (e) {
    puppeteerState = 'ERROR: ' + e.message;
  }

  res.json({
    tenant: { id: TENANT_ID, slug: TENANT_SLUG },
    whatsapp: { 
      clientReady: clientReady,
      clientState: clientState,
      puppeteerState: puppeteerState,
      canSendMessages: canSendMessages,
      readyToSend: canSendMessages ? '✅ SIM - Pronto para enviar' : '❌ NÃO - Aguarde estado READY'
    },
    supabase: {
      url: SUPABASE_URL,
      hasServiceRole: !!SUPABASE_SERVICE_ROLE,
      keyPreview: SUPABASE_SERVICE_ROLE ? `${SUPABASE_SERVICE_ROLE.substring(0, 20)}...` : 'N/A'
    },
    timestamp: new Date().toISOString()
  });
});

// ===== CONTROLE DE JOBS =====
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
    console.error('❌ Erro criar job:', error);
    res.status(500).json({ error: error.message });
  }
});

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
    console.error('❌ Erro atualizar job:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sending-job/pending', async (req, res) => {
  try {
    const { jobType } = req.query;
    if (!jobType) return res.status(400).json({ error: 'jobType é obrigatório' });

    const jobs = await supa(`/sending_jobs?job_type=eq.${jobType}&status=eq.paused&order=created_at.desc&limit=1`);
    
    res.json({ success: true, job: jobs?.[0] || null });
  } catch (error) {
    console.error('❌ Erro buscar job:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== ENVIO DE MENSAGENS =====
app.post('/send', async (req, res) => {
  console.log('\n📥 ===== POST /send =====');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { number, phone, message } = req.body;
    const targetPhone = number || phone;
    
    if (!targetPhone || !message) {
      return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });
    }

    const result = await sendWhatsAppMessageWithRetry(targetPhone, message);
    res.json(result);
  } catch (error) {
    console.error('❌ Erro /send:', error);
    res.status(500).json({ error: error.message, clientState, clientReady });
  }
});

app.post('/send-item-added', async (req, res) => {
  console.log('\n🛒 ===== POST /send-item-added =====');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { phone, product_id, quantity = 1 } = req.body;
    
    if (!phone || !product_id) {
      return res.status(400).json({ error: 'Telefone e product_id são obrigatórios' });
    }

    // NORMALIZAR telefone recebido (remove DDI se tiver)
    const normalizedPhone = normalizeForStorage(phone);
    console.log(`📞 Telefone recebido: ${phone} -> normalizado: ${normalizedPhone}`);

    const products = await supa(`/products?select=*&id=eq.${product_id}`);
    const product = products?.[0];

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    console.log(`📦 Produto encontrado: ${product.name} (${product.code}) - Preço: ${fmtMoney(product.price)}`);
    console.log(`📊 Quantidade: ${quantity} - Total: ${fmtMoney(product.price * quantity)}`);

    const message = await composeItemAdded(product, quantity);
    console.log(`📝 Mensagem composta (${message.length} chars)`);
    
    // sendWhatsAppMessageWithRetry já normaliza internamente para adicionar DDI
    const result = await sendWhatsAppMessageWithRetry(normalizedPhone, message);
    
    console.log(`✅ Mensagem enviada com sucesso para ${normalizedPhone}`);
    res.json({ ...result, product: product.name, message });
  } catch (error) {
    console.error('❌ Erro /send-item-added:', error);
    res.status(500).json({ error: error.message, clientState, clientReady });
  }
});

app.post('/send-paid-order', async (req, res) => {
  console.log('\n💰 ===== POST /send-paid-order =====');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { phone, order_id } = req.body;
    
    if (!phone || !order_id) {
      return res.status(400).json({ error: 'Telefone e order_id são obrigatórios' });
    }

    const orders = await supa(`/orders?select=*&id=eq.${order_id}`);
    const order = orders?.[0];

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    console.log(`🧾 Pedido: #${order.id} - ${fmtMoney(order.total_amount)}`);

    const message = await composePaidOrder(order);
    const result = await sendWhatsAppMessageWithRetry(phone, message);
    
    res.json({ ...result, order_id: order.id, message });
  } catch (error) {
    console.error('❌ Erro /send-paid-order:', error);
    res.status(500).json({ error: error.message, clientState, clientReady });
  }
});

app.post('/send-finalize', async (req, res) => {
  console.log('\n✅ ===== POST /send-finalize =====');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Telefone é obrigatório' });
    }

    const message = await composeFinalize();
    const result = await sendWhatsAppMessageWithRetry(phone, message);
    
    res.json({ ...result, message });
  } catch (error) {
    console.error('❌ Erro /send-finalize:', error);
    res.status(500).json({ error: error.message, clientState, clientReady });
  }
});

app.get('/list-all-groups', async (req, res) => {
  console.log('\n📋 ===== GET /list-all-groups =====');
  
  try {
    if (!clientReady) {
      return res.status(503).json({ success: false, error: 'WhatsApp não conectado' });
    }

    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);
    
    const groupList = groups.map((group) => ({
      id: group.id._serialized,
      name: group.name,
      participantCount: group.participants ? group.participants.length : 0,
      isActive: !group.archived,
      description: group.description || ''
    }));

    console.log(`✅ ${groupList.length} grupos encontrados`);
    
    res.json({ success: true, groups: groupList, total: groupList.length });
  } catch (error) {
    console.error('❌ Erro listar grupos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/send-to-group', async (req, res) => {
  console.log('\n📤 ===== POST /send-to-group =====');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    if (!clientReady) {
      return res.status(503).json({ success: false, error: 'WhatsApp não conectado' });
    }

    const { groupId, message, imageUrl } = req.body;
    
    if (!groupId || !message) {
      return res.status(400).json({ error: 'groupId e message são obrigatórios' });
    }

    const chats = await client.getChats();
    const group = chats.find(chat => chat.id._serialized === groupId && chat.isGroup);
    
    if (!group) {
      return res.status(404).json({ success: false, error: 'Grupo não encontrado' });
    }

    console.log(`👥 Enviando para: ${group.name} (${group.participants?.length || 0} participantes)`);

    let result;
    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl);
      result = await client.sendMessage(groupId, media, { caption: message });
    } else {
      result = await client.sendMessage(groupId, message);
    }

    console.log(`✅ Mensagem enviada para grupo`);

    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID, 
        phone: groupId,
        message: message,
        type: 'outgoing_group',
        sent_at: new Date().toISOString(),
        group_name: group.name
      })
    });

    res.json({ 
      success: true, 
      groupId, 
      groupName: group.name,
      messageId: result.id._serialized,
      participantCount: group.participants?.length || 0
    });
  } catch (error) {
    console.error('❌ Erro enviar para grupo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/broadcast/orders', async (req, res) => {
  console.log('\n📢 ===== POST /api/broadcast/orders =====');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    if (!clientReady) {
      return res.status(503).json({ success: false, error: 'WhatsApp não conectado' });
    }

    const { key, status, message, startDate, endDate, interval = 2000, batchSize = 5, batchDelay = 3000 } = req.body;

    if (key !== 'whatsapp-broadcast-2024') {
      return res.status(403).json({ error: 'Chave inválida' });
    }

    if (!message || !status) {
      return res.status(400).json({ error: 'message e status são obrigatórios' });
    }

    let query = '/orders?select=customer_phone,customer_name';
    
    if (status === 'paid') {
      query += '&is_paid=eq.true';
    } else if (status === 'unpaid') {
      query += '&is_paid=eq.false';
    }

    if (startDate) query += `&created_at=gte.${startDate}T00:00:00`;
    if (endDate) query += `&created_at=lte.${endDate}T23:59:59`;

    console.log(`🔍 Query: ${query}`);

    const orders = await supa(query);
    
    if (!orders || orders.length === 0) {
      return res.json({ success: true, total: 0, message: 'Nenhum pedido encontrado' });
    }

    const uniquePhones = [...new Set(orders.map(o => o.customer_phone).filter(Boolean))];
    console.log(`📱 ${uniquePhones.length} números únicos`);

    if (uniquePhones.length === 0) {
      return res.json({ success: true, total: 0, message: 'Nenhum telefone válido' });
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < uniquePhones.length; i += batchSize) {
      const batch = uniquePhones.slice(i, i + batchSize);
      console.log(`📤 Lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniquePhones.length / batchSize)}`);

      await Promise.all(
        batch.map(async (phone) => {
          try {
            await sendWhatsAppMessageWithRetry(phone, message, 2); // 2 tentativas para broadcast
            successCount++;
            await delay(interval);
          } catch (error) {
            console.error(`❌ Erro ${phone}:`, error.message);
            errorCount++;
          }
        })
      );

      if (i + batchSize < uniquePhones.length) {
        console.log(`⏳ Aguardando ${batchDelay}ms...`);
        await delay(batchDelay);
      }
    }

    console.log(`✅ Broadcast: ${successCount} sucessos, ${errorCount} erros`);

    res.json({
      success: true,
      total: successCount,
      errors: errorCount,
      message: `Enviado para ${successCount} contatos`
    });

  } catch (error) {
    console.error('❌ Erro broadcast:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ============================ INICIALIZAÇÃO ============================ */
console.log('\n🚀 ========================================');
console.log('🚀 INICIANDO SERVIDOR WHATSAPP');
console.log(`🏢 Tenant: ${TENANT_SLUG} (${TENANT_ID})`);
console.log('🚀 ========================================\n');

client.initialize();

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🌐 ========================================');
  console.log(`🌐 SERVIDOR RODANDO NA PORTA ${PORT}`);
  console.log('🌐 ========================================');
  console.log(`📋 Status: http://localhost:${PORT}/status`);
  console.log(`📤 Endpoints disponíveis:`);
  console.log(`   POST /send`);
  console.log(`   POST /send-item-added`);
  console.log(`   POST /send-paid-order`);
  console.log(`   POST /send-finalize`);
  console.log(`   GET  /list-all-groups`);
  console.log(`   POST /send-to-group`);
  console.log(`   POST /api/broadcast/orders`);
  console.log('========================================\n');
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  if (clientReady) await client.destroy();
  process.exit();
});
