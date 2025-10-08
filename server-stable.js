/**
 * server-stable.js — Servidor WhatsApp ESTÁVEL (versão simplificada)
 * Uso (PowerShell):
 * node server-stable.js
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');

// Fetch polyfill
if (typeof fetch !== 'function') {
  global.fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
}

/* ============================ CONFIG ============================ */
const PORT = process.env.PORT || 3333;
const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';
const TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
const TENANT_SLUG = 'app';

console.log('🚀 Servidor WhatsApp ESTÁVEL - Versão Simplificada');
console.log(`🏢 Tenant: ${TENANT_SLUG}`);

/* ============================ UTILS ============================ */
const delay = (ms) => new Promise(r => setTimeout(r, ms));
function fmtMoney(v) { return `R$ ${Number(v||0).toFixed(2).replace('.', ',')}`; }

function normalizeDDD(phone) {
  if (!phone) return phone;
  const clean = phone.replace(/\D/g, '');
  const withoutDDI = clean.startsWith('55') ? clean.substring(2) : clean;
  let normalized = withoutDDI;
  
  if (normalized.length >= 10 && normalized.length <= 11) {
    const ddd = parseInt(normalized.substring(0, 2));
    if (ddd >= 11 && ddd <= 99) {
      if (normalized.length === 10 && normalized[2] !== '9') {
        normalized = normalized.substring(0, 2) + '9' + normalized.substring(2);
      }
    }
  }
  
  return '55' + normalized;
}

/* ============================ SUPABASE ============================ */
async function supaRaw(pathname, init) {
  const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1${pathname}`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  const finalInit = { ...(init || {}), headers: { ...headers, ...((init && init.headers) || {}) } };
  if ((finalInit.method || '').toUpperCase() === 'POST' && !('Prefer' in finalInit.headers)) {
    finalInit.headers.Prefer = 'return=representation';
  }
  const res = await fetch(url, finalInit);
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function supa(pathname, init) {
  const separator = pathname.includes('?') ? '&' : '?';
  pathname += `${separator}tenant_id=eq.${TENANT_ID}`;
  return supaRaw(pathname, init);
}

/* ============================ TEMPLATES ============================ */
let templatesCache = {};

async function loadTemplates() {
  try {
    const templates = await supa('/whatsapp_templates?select=*');
    templatesCache = {};
    templates.forEach(t => templatesCache[t.type] = t);
    console.log(`📄 Templates: ${Object.keys(templatesCache).join(', ')}`);
  } catch (e) {
    console.error('❌ Erro templates:', e.message);
  }
}

function replaceVars(template, vars) {
  if (!template) return '';
  let result = template;
  Object.keys(vars).forEach(key => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), vars[key] || '');
  });
  return result;
}

async function composeItemAdded(product, qty = 1) {
  const t = templatesCache['ITEM_ADDED'];
  const total = Number(product.price || 0) * Number(qty);
  
  if (t) {
    return replaceVars(t.content, {
      produto: product.name,
      codigo: product.code ? `(${product.code})` : '',
      quantidade: String(qty),
      preco: fmtMoney(product.price),
      valor: fmtMoney(product.price),
      total: fmtMoney(total),
    });
  }
  
  return `🛒 *Item adicionado*\n\n✅ ${product.name}\nQtd: *${qty}*\nPreço: *${fmtMoney(product.price)}*\nTotal: *${fmtMoney(total)}*\n\nDigite *FINALIZAR* para concluir.`;
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
      '--disable-gpu'
    ]
  }
});

let isReady = false;

client.on('qr', (qr) => {
  console.log('\n📱 ESCANEIE O QR CODE:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ WhatsApp CONECTADO!');
  isReady = true;
  loadTemplates();
});

client.on('authenticated', () => {
  console.log('🔐 Autenticado');
});

client.on('auth_failure', () => {
  console.error('❌ Falha autenticação');
  isReady = false;
});

client.on('disconnected', (reason) => {
  console.error(`❌ Desconectado: ${reason}`);
  isReady = false;
  
  if (reason === 'LOGOUT') {
    console.log('⚠️  LOGOUT detectado! Reinicie o servidor manualmente.');
    console.log('   1. Ctrl+C para parar');
    console.log('   2. Execute: .\\fix-lockfile.ps1');
    console.log('   3. Reinicie: node server-stable.js');
  }
});

client.on('message', async (msg) => {
  try {
    let phone = msg.from.replace('@c.us', '').replace('@g.us', '');
    let groupName = null;
    
    if (msg.from.includes('@g.us')) {
      const chat = await msg.getChat();
      if (chat.isGroup) {
        groupName = chat.name;
        phone = msg.author ? msg.author.replace('@c.us', '') : phone;
      }
    }
    
    // Salvar mensagem
    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        phone: phone.replace(/\D/g, '').replace(/^55/, ''),
        message: msg.body || '',
        type: 'incoming',
        received_at: new Date().toISOString(),
        whatsapp_group_name: groupName
      })
    });
    
    const text = String(msg.body || '').trim().toUpperCase();
    
    // Comando FINALIZAR
    if (text === 'FINALIZAR') {
      const finalizeMsg = 'Perfeita escolha! 💖\nPara pagar: https://app.orderzaps.com/checkout';
      await sendMessage(phone, finalizeMsg);
      return;
    }
    
    // Código de produto
    const match = text.match(/^(?:[CPA]\s*)?(\d{1,6})$/);
    if (match) {
      const num = match[1];
      const codes = [`C${num}`, `P${num}`, `A${num}`, num];
      const products = await supa(`/products?select=*&is_active=eq.true&code=in.(${codes.map(c => `"${c}"`).join(',')})`);
      
      if (products?.[0]) {
        const product = products[0];
        await processProduct(phone, product, groupName);
        const confirmMsg = await composeItemAdded(product);
        await sendMessage(phone, confirmMsg);
      }
    }
  } catch (error) {
    console.error('❌ Erro processar mensagem:', error.message);
  }
});

async function sendMessage(phone, message) {
  if (!isReady) {
    throw new Error('WhatsApp não conectado');
  }
  
  const normalized = normalizeDDD(phone);
  const chatId = `${normalized}@c.us`;
  
  console.log(`📤 Enviando para ${normalized}`);
  await client.sendMessage(chatId, message);
  
  // Salvar no banco
  await supa('/whatsapp_messages', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: TENANT_ID,
      phone: phone.replace(/\D/g, '').replace(/^55/, ''),
      message,
      type: 'outgoing',
      sent_at: new Date().toISOString()
    })
  });
  
  console.log(`✅ Enviado`);
}

async function processProduct(phone, product, groupName) {
  const cleanPhone = phone.replace(/\D/g, '').replace(/^55/, '');
  const today = new Date().toISOString().split('T')[0];
  
  try {
    let customers = await supa(`/customers?select=*&phone=eq.${cleanPhone}`);
    let customer = customers?.[0];
    
    if (!customer) {
      const newCustomers = await supa('/customers', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: TENANT_ID, phone: cleanPhone, name: cleanPhone })
      });
      customer = newCustomers?.[0];
    }
    
    let carts = await supa(`/carts?select=*&customer_phone=eq.${cleanPhone}&event_date=eq.${today}&status=eq.OPEN`);
    let cart = carts?.[0];
    
    if (!cart) {
      const newCarts = await supa('/carts', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          customer_phone: cleanPhone,
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
      
      // Criar/atualizar pedido
      const items = await supa(`/cart_items?select=qty,unit_price&cart_id=eq.${cart.id}`);
      const total = items.reduce((sum, it) => sum + Number(it.unit_price || 0) * Number(it.qty || 1), 0);
      
      const orders = await supa(`/orders?select=*&cart_id=eq.${cart.id}`);
      if (!orders?.[0]) {
        await supa('/orders', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            cart_id: cart.id,
            event_date: today,
            total_amount: total,
            is_paid: false,
            customer_phone: cleanPhone,
            event_type: 'whatsapp'
          })
        });
      } else {
        await supa(`/orders?id=eq.${orders[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ total_amount: total })
        });
      }
    }
  } catch (error) {
    console.error('❌ Erro processar produto:', error.message);
  }
}

/* ============================ EXPRESS API ============================ */
const app = express();
app.use(express.json());
app.use(cors());

app.get('/status', (req, res) => {
  res.json({
    tenant: { id: TENANT_ID, slug: TENANT_SLUG },
    whatsapp: { ready: isReady },
    timestamp: new Date().toISOString()
  });
});

app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'phone e message obrigatórios' });
    }
    await sendMessage(phone, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/send-item-added', async (req, res) => {
  try {
    const { phone, product_id, quantity = 1 } = req.body;
    if (!phone || !product_id) {
      return res.status(400).json({ error: 'phone e product_id obrigatórios' });
    }
    
    const products = await supa(`/products?select=*&id=eq.${product_id}`);
    const product = products?.[0];
    
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    const message = await composeItemAdded(product, quantity);
    await sendMessage(phone, message);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/list-all-groups', async (req, res) => {
  try {
    if (!isReady) {
      return res.status(503).json({ error: 'WhatsApp não conectado' });
    }
    
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup).map(g => ({
      id: g.id._serialized,
      name: g.name,
      participantCount: g.participants?.length || 0
    }));
    
    res.json({ success: true, groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/send-to-group', async (req, res) => {
  try {
    if (!isReady) {
      return res.status(503).json({ error: 'WhatsApp não conectado' });
    }
    
    const { groupId, message, imageUrl } = req.body;
    if (!groupId || !message) {
      return res.status(400).json({ error: 'groupId e message obrigatórios' });
    }
    
    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      await client.sendMessage(groupId, media, { caption: message });
    } else {
      await client.sendMessage(groupId, message);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================ INICIALIZAÇÃO ============================ */
console.log('\n🚀 Iniciando...\n');

client.initialize();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐 Servidor rodando na porta ${PORT}`);
  console.log(`📋 Status: http://localhost:${PORT}/status\n`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando...');
  process.exit();
});
