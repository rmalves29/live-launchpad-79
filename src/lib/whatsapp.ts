import { supabase } from '@/integrations/supabase/client';

// Lightweight WhatsApp sending helper used by the frontend (no secrets required)
// Strategy:
// 1) Try to send directly to your local/remote Node server (default: http://localhost:3000)
//    - You can override the base URL by setting localStorage.setItem('whatsapp_api_url', 'http://SEU_HOST:3000')
// 2) Log every outgoing message in the database (whatsapp_messages)
// 3) Optional fallback: invoke the Supabase Edge Function to keep previous behavior/logs

const DEFAULT_WA_BASE = 'http://localhost:3333';

function getBaseUrl(): string {
  // Allow override via localStorage
  const fromStorage = typeof window !== 'undefined' ? localStorage.getItem('whatsapp_api_url') : null;
  const base = (fromStorage || DEFAULT_WA_BASE).trim();
  return base.replace(/\/$/, ''); // remove trailing slash
}

// Nova função para envios em massa usando a API otimizada
export async function sendBulkMessages(phoneNumbers: string[], message: string) {
  const baseUrl = getBaseUrl();
  
  try {
    const response = await fetch(`${baseUrl}/api/send-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: JSON.stringify({
          numeros: phoneNumbers,
          mensagens: [message],
          interval: 2000,
          batchSize: 5,
          batchDelay: 3000
        })
      })
    });

    if (!response.ok) {
      throw new Error(`Erro no servidor: ${response.status}`);
    }

    const result = await response.json();
    return result.sucesso;
  } catch (error) {
    console.error('Erro ao enviar mensagens em massa:', error);
    return false;
  }
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
        console.log(`Tentando enviar para ${baseUrl}${a.path}`, { phone, messageLength: message.length });
        
        const resp = await fetch(`${baseUrl}${a.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(a.body),
        });
        
        if (resp.ok) {
          console.log(`Mensagem enviada com sucesso via ${a.path}`, { phone });
          
          // Adicionar tag "app" ao cliente após envio bem-sucedido
          try {
            await fetch(`${baseUrl}/add-label`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, label: 'app' }),
            });
            console.log(`Tag "app" adicionada ao cliente ${phone}`);
          } catch (labelError) {
            console.warn(`Erro ao adicionar tag "app" ao cliente ${phone}:`, labelError);
          }
          
          return true;
        }
        
        // Se o servidor está reiniciando, aguardar um pouco antes de tentar novamente
        const errorText = await resp.text().catch(() => '');
        if (errorText.includes('restarting') || errorText.includes('indisponível')) {
          console.log('Servidor reiniciando, aguardando 3 segundos...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (resp.status !== 404) {
          console.warn(`Tentativa falhou (${a.path}):`, resp.status, errorText);
        }
        
      } catch (error) {
        console.warn(`Erro na tentativa (${a.path}):`, error);
      }
    }
  } catch (error) {
    console.warn('Erro geral no trySendViaNode:', error);
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
