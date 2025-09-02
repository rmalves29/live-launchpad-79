import { supabase } from '@/integrations/supabase/client';

// Lightweight WhatsApp sending helper used by the frontend (no secrets required)
// Strategy:
// 1) Try to send directly to your local/remote Node server (default: http://localhost:3000)
//    - You can override the base URL by setting localStorage.setItem('whatsapp_api_url', 'http://SEU_HOST:3000')
// 2) Log every outgoing message in the database (whatsapp_messages)
// 3) Optional fallback: invoke the Supabase Edge Function to keep previous behavior/logs

const DEFAULT_WA_BASE = 'http://localhost:3333';

// Helper function to get the base URL for WhatsApp API
function getBaseUrl(): string {
  // Check if there's a custom URL in localStorage first
  const customUrl = localStorage.getItem('whatsapp_server_url');
  if (customUrl) {
    return customUrl.replace(/\/+$/, ''); // Remove trailing slashes
  }
  
  return 'http://localhost:3333';
}

// Function to send bulk messages using the new optimized endpoint
export async function sendBulkMessages(phoneNumbers: string[], message: string): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl();
    
    const response = await fetch(`${baseUrl}/api/send-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: JSON.stringify({
          numeros: phoneNumbers,
          mensagens: [message],
          interval: 3000,
          batchSize: 3,
          batchDelay: 5000
        })
      }),
    });

    if (!response.ok) {
      console.error('Failed to send bulk messages:', response.statusText);
      return false;
    }

    const result = await response.json();
    console.log('✅ Bulk messages initiated:', result);
    return true;
  } catch (error) {
    console.error('Error sending bulk messages:', error);
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

// Function that tries to send via Node.js server first, trying multiple bases and message formats
async function trySendViaNode(phone: string, message: string): Promise<boolean> {
  const baseUrl = getBaseUrl();
  
  try {
    console.log(`🔄 Tentativa de envio direto via ${baseUrl}...`);
    
    // Try sending message
    const sendResponse = await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, message }),
    });

    if (sendResponse.ok) {
      const result = await sendResponse.json();
      console.log(`✅ Mensagem enviada com sucesso via ${baseUrl}:`, result);
      
      // Try to add label after successful send
      try {
        const labelResponse = await fetch(`${baseUrl}/add-label`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, label: 'APP' }),
        });
        
        if (labelResponse.ok) {
          console.log(`✅ Label "APP" adicionada com sucesso para ${phone}`);
        } else {
          console.warn(`⚠️ Falha ao adicionar label para ${phone}:`, labelResponse.statusText);
        }
      } catch (labelError) {
        console.warn(`⚠️ Erro ao tentar adicionar label:`, labelError);
      }
      
      return true;
    } else {
      console.log(`❌ Falha no envio via ${baseUrl}:`, sendResponse.statusText);
    }
  } catch (error) {
    console.log(`❌ Erro na tentativa ${baseUrl}:`, error);
  }

  return false;
}

// Function to send item added messages with automatic webhook format
export async function sendItemAddedMessage(args: {
  phone: string;
  customerName?: string;
  productName: string;
  quantity: number;
  price: number;
}): Promise<boolean> {
  const { phone, customerName, productName, quantity, price } = args;
  
  try {
    const baseUrl = getBaseUrl();
    
    // Use the new webhook endpoint for item added
    const response = await fetch(`${baseUrl}/api/test/item-added`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        customer_name: customerName,
        product: {
          name: productName,
          qty: quantity,
          price: price
        }
      }),
    });

    if (response.ok) {
      console.log('✅ Item added message sent successfully');
      
      // Log to database
      try {
        await supabase.from('whatsapp_messages').insert({
          phone,
          message: `Item adicionado: ${productName}`,
          type: 'item_added',
          product_name: productName,
          amount: price,
          sent_at: new Date().toISOString(),
        });
      } catch (logError) {
        console.warn('Failed to log message to database:', logError);
      }
      
      return true;
    } else {
      console.error('Failed to send item added message:', response.statusText);
      return false;
    }
  } catch (error) {
    console.error('Error sending item added message:', error);
    
    // Fallback to original function
    const message = buildItemAddedMessage({ customerName, productName, quantity, price });
    return await trySendViaNode(phone, message);
  }
}
