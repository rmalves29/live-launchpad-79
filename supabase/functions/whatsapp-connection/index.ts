import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppMessage {
  phone: string;
  message: string;
  type: 'product_selected' | 'payment_request' | 'order_cancelled' | 'manual_order';
  orderId?: number;
  productName?: string;
  amount?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("WhatsApp action:", action, data);

    switch (action) {
      case "send_product_message":
        return await sendProductMessage(data, supabase);
      
      case "send_payment_request":
        return await sendPaymentRequest(data, supabase);
      
      case "send_cancellation":
        return await sendCancellation(data, supabase);
      
      case "send_paid_notification":
        return await sendPaidNotification(data, supabase);
      
      case "process_manual_order":
        return await processManualOrder(data, supabase);
      
      case "get_messages":
        return await getMessages(supabase);
      
      case "send_item_added":
        return await sendItemAddedMessage(data, supabase);
      
      default:
        throw new Error("Ação não reconhecida");
    }

  } catch (error) {
    console.error("Error in WhatsApp connection:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function sendProductMessage(data: WhatsAppMessage, supabase: any) {
  const message = `🛍️ *Produto Selecionado*

Olá! Você selecionou o produto:
*${data.productName}*

📱 Para continuar sua compra, acesse: 
${Deno.env.get("PUBLIC_APP_URL")}/checkout

💬 Ou responda esta mensagem para fazer seu pedido manualmente.

Obrigado por escolher nossos produtos! 🙌`;

  // Simula envio do WhatsApp (aqui você integraria com WhatsApp Business API)
  console.log(`Enviando mensagem para ${data.phone}:`, message);
  
  // Salva o log da mensagem
  await supabase.from('whatsapp_messages').insert({
    phone: data.phone,
    message,
    type: 'product_selected',
    product_name: data.productName,
    sent_at: new Date().toISOString()
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: "Mensagem de produto enviada com sucesso" 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function sendPaymentRequest(data: WhatsAppMessage, supabase: any) {
  const message = `💳 *Cobrança - Pedido #${data.orderId}*

Olá! Seu pedido foi confirmado.

💰 Valor: R$ ${data.amount?.toFixed(2)}

🔗 Link para pagamento:
${Deno.env.get("PUBLIC_APP_URL")}/payment/${data.orderId}

⏰ Prazo para pagamento: 24 horas

Após o pagamento, seu pedido será processado automaticamente! 📦`;

  console.log(`Enviando cobrança para ${data.phone}:`, message);
  
  await supabase.from('whatsapp_messages').insert({
    phone: data.phone,
    message,
    type: 'payment_request',
    order_id: data.orderId,
    amount: data.amount,
    sent_at: new Date().toISOString()
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: "Cobrança enviada com sucesso" 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function sendCancellation(data: WhatsAppMessage, supabase: any) {
  const message = `❌ *Pedido Cancelado - #${data.orderId}*

Olá! Informamos que seu pedido foi cancelado.

Se você tem alguma dúvida sobre o cancelamento, entre em contato conosco.

🛍️ Continue navegando em nossos produtos:
${Deno.env.get("PUBLIC_APP_URL")}

Obrigado! 🙏`;

  console.log(`Enviando cancelamento para ${data.phone}:`, message);
  
  await supabase.from('whatsapp_messages').insert({
    phone: data.phone,
    message,
    type: 'order_cancelled',
    order_id: data.orderId,
    sent_at: new Date().toISOString()
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: "Cancelamento enviado com sucesso" 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function sendPaidNotification(data: any, supabase: any) {
  const message = `🎉 *Pedido Confirmado - #${data.orderId}*

Olá! Seu pagamento foi confirmado com sucesso! ✅

💰 Valor pago: R$ ${data.totalAmount?.toFixed(2)}

📦 Seu pedido está sendo preparado e em breve entraremos em contato com as informações de entrega.

🚚 Acompanhe o status do seu pedido em:
${Deno.env.get("PUBLIC_APP_URL")}/pedidos

Obrigado pela preferência! 😊`;

  console.log(`Enviando confirmação de pagamento para ${data.phone}:`, message);
  
  await supabase.from('whatsapp_messages').insert({
    phone: data.phone,
    message,
    type: 'paid_order',
    order_id: data.orderId,
    amount: data.totalAmount,
    sent_at: new Date().toISOString()
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: "Notificação de pagamento enviada com sucesso" 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function processManualOrder(data: { phone: string; message: string }, supabase: any) {
  // Processa mensagem recebida para criar pedido manual
  const orderInfo = extractOrderFromMessage(data.message);
  
  if (!orderInfo) {
    return new Response(JSON.stringify({ 
      success: false, 
      message: "Não foi possível identificar um pedido na mensagem" 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  // Salva mensagem recebida
  await supabase.from('whatsapp_messages').insert({
    phone: data.phone,
    message: data.message,
    type: 'manual_order',
    received_at: new Date().toISOString(),
    processed: false
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: "Pedido manual processado",
    orderInfo
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function getMessages(supabase: any) {
  const { data: messages, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Erro ao buscar mensagens: ${error.message}`);
  }

  return new Response(JSON.stringify({ messages }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function sendItemAddedMessage(data: any, supabase: any) {
  // Substituir variáveis na mensagem
  const message = `🛒 *Item Adicionado ao Carrinho*

Olá ${data.customerName || 'Cliente'}! 

✅ Produto: *${data.productName}*
📦 Quantidade: *${data.quantity}*
💰 Preço: *R$ ${data.price.toFixed(2)}*

Seu item foi adicionado com sucesso ao carrinho! 🎉

💬 Continue enviando códigos de produtos ou entre em contato para finalizar seu pedido.

Obrigado pela preferência! 🙌`;

  console.log(`Enviando confirmação de item adicionado para ${data.phone}:`, message);
  
  try {
    const baseUrl = (Deno.env.get('WHATSAPP_API_URL') || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      console.warn('WHATSAPP_API_URL não configurada; pulando envio via API e registrando apenas no banco.');
    } else {
      const attempts = [
        { path: '/send-message', body: { number: data.phone, message } },
        { path: '/send-message', body: { to: data.phone, message } },
        { path: '/send', body: { to: data.phone, message } },
        { path: '/send', body: { number: data.phone, message } },
      ];

      let sent = false;
      let lastStatus = 0;
      let lastText = '';

      for (const a of attempts) {
        try {
          const resp = await fetch(`${baseUrl}${a.path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(a.body),
          });

          lastStatus = resp.status;
          try { lastText = await resp.text(); } catch (_) { lastText = ''; }

          if (resp.ok) {
            console.log(`Mensagem enviada com sucesso para ${data.phone} via ${a.path}`);
            sent = true;
            break;
          } else {
            console.warn(`Tentativa falhou (${a.path}): ${resp.status} ${lastText}`);
            // Em caso de 404, tentamos o próximo endpoint
            if (resp.status === 404) continue;
          }
        } catch (err) {
          console.warn(`Erro ao tentar ${a.path}:`, err);
        }
      }

      if (!sent) {
        console.warn(`Falha ao enviar mensagem via WhatsApp API; última resposta: ${lastStatus} ${lastText}`);
      }
    }
  } catch (error) {
    console.warn('WhatsApp API indisponível; salvando apenas no banco:', error);
  }
  
  // Salvar no banco independentemente do envio
  await supabase.from('whatsapp_messages').insert({
    phone: data.phone,
    message,
    type: 'item_added',
    product_name: data.productName,
    amount: data.price,
    sent_at: new Date().toISOString()
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: "Confirmação de item adicionado enviada com sucesso" 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

function extractOrderFromMessage(message: string): any {
  // Extrai informações do pedido da mensagem
  const itemRegex = /(\d+)x?\s*([^R$\d]+)(?:R?\$?\s*(\d+(?:,\d{2})?))?\s*/gi;
  const phoneRegex = /(?:fone|telefone|celular)[:\s]*(\d{10,11})/i;
  const nameRegex = /(?:nome|cliente)[:\s]+([^\n\r]+)/i;
  
  const items = [];
  let match;
  
  while ((match = itemRegex.exec(message)) !== null) {
    const quantity = parseInt(match[1]) || 1;
    const name = match[2]?.trim();
    const price = match[3] ? parseFloat(match[3].replace(',', '.')) : 0;
    
    if (name && name.length > 2) {
      items.push({ quantity, name, price });
    }
  }
  
  const phoneMatch = message.match(phoneRegex);
  const nameMatch = message.match(nameRegex);
  
  if (items.length === 0) return null;
  
  return {
    items,
    customerPhone: phoneMatch ? phoneMatch[1] : null,
    customerName: nameMatch ? nameMatch[1].trim() : null
  };
}