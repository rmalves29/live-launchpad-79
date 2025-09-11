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
  process.env.SUPABASE_SERVICE_KEY || '';

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
    console.log(`📨 Mensagem recebida de ${msg.from}: ${msg.body}`);
    
    // Salvar mensagem no banco
    await supa('/whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        phone: msg.from,
        message: msg.body,
        type: 'incoming',
        received_at: new Date().toISOString()
      })
    });

    const text = String(msg.body || '').trim().toUpperCase();
    console.log(`🔍 Texto processado: "${text}"`);
    
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
        await processProductCode(msg.from, product);
        const message = await composeItemAdded(product);
        await client.sendMessage(msg.from, message);
        console.log(`✅ Confirmação enviada para ${msg.from}`);
      } else {
        console.log(`❌ Nenhum produto encontrado para os códigos:`, candidates);
      }
    } else {
      console.log(`❌ Mensagem não corresponde ao padrão de código: "${text}"`);
    }
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
    console.error('Stack trace:', error.stack);
  }
});

async function processProductCode(phone, product) {
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
          tenant_id: TENANT_ID, customer_phone: normalizedPhone, event_date: today, event_type: 'whatsapp', status: 'OPEN'
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
  if (clientReady) await client.destroy();
  process.exit();
});

console.log('\n📖 COMANDO PARA EXECUTAR (PowerShell):');
console.log('$env:SUPABASE_SERVICE_ROLE="COLE_SUA_SERVICE_ROLE_AQUI"; $env:TENANT_ID="08f2b1b9-3988-489e-8186-c60f0c0b0622"; $env:TENANT_SLUG="app"; node server-whatsapp-individual-no-env.js');
console.log('\n✅ Sistema pronto para detectar códigos automaticamente!');