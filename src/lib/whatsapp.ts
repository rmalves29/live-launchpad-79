import { supabase } from '@/integrations/supabase/client';

// Lightweight WhatsApp sending helper used by the frontend (no secrets required)
// Strategy:
// 1) Try to send directly to your local/remote Node server (default: http://localhost:3000)
//    - You can override the base URL by setting localStorage.setItem('whatsapp_api_url', 'http://SEU_HOST:3000')
// 2) Log every outgoing message in the database (whatsapp_messages)
// 3) Optional fallback: invoke the Supabase Edge Function to keep previous behavior/logs

const DEFAULT_WA_BASE = 'http://localhost:3000';

function getBaseUrl(): string {
  // Allow override via localStorage
  const fromStorage = typeof window !== 'undefined' ? localStorage.getItem('whatsapp_api_url') : null;
  const base = (fromStorage || DEFAULT_WA_BASE).trim();
  return base.replace(/\/$/, ''); // remove trailing slash
}

function buildItemAddedMessage(args: {
  customerName?: string;
  productName: string;
  quantity: number;
  price: number;
}) {
  const name = args.customerName || 'Cliente';
  return `🛒 *Item Adicionado ao Carrinho*

Olá ${name}! 

✅ Produto: *${args.productName}*
📦 Quantidade: *${args.quantity}*
💰 Preço: *R$ ${Number(args.price).toFixed(2)}*

Seu item foi adicionado com sucesso ao carrinho! 🎉

💬 Continue enviando códigos de produtos ou entre em contato para finalizar seu pedido.

Obrigado pela preferência! 🙌`;
}

async function trySendViaNode(phone: string, message: string) {
  const baseUrl = getBaseUrl();
  try {
    const attempts = [
      { path: '/send-message', body: { number: phone, message } },
      { path: '/send-message', body: { to: phone, message } },
      { path: '/send', body: { to: phone, message } },
      { path: '/send', body: { number: phone, message } },
    ];

    for (const a of attempts) {
      try {
        const resp = await fetch(`${baseUrl}${a.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(a.body),
        });
        if (resp.ok) return true;
        // If 404 try next attempt
        if (resp.status === 404) continue;
      } catch (_) {
        // try next attempt
      }
    }
  } catch (_) {
    // ignore
  }
  return false;
}

export async function sendItemAddedMessage(args: {
  phone: string;
  customerName?: string;
  productName: string;
  quantity: number;
  price: number;
}) {
  const { phone, customerName, productName, quantity, price } = args;
  const message = buildItemAddedMessage({ customerName, productName, quantity, price });

  // 1) Try Node server first
  const sent = await trySendViaNode(phone, message);

  // 2) Log to DB regardless
  try {
    await supabase.from('whatsapp_messages').insert({
      phone,
      message,
      type: 'item_added',
      product_name: productName,
      amount: price,
      sent_at: new Date().toISOString(),
    });
  } catch (_) {
    // ignore log errors
  }

  // 3) Fallback to edge function (keeps current behavior) if not sent
  if (!sent) {
    try {
      await supabase.functions.invoke('whatsapp-connection', {
        body: { action: 'send_item_added', data: { phone, customerName, productName, quantity, price } },
      });
    } catch (_) {
      // ignore
    }
  }

  return sent;
}
