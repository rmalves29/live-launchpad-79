import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppMessage {
  phone: string;
  message: string;
  groupName?: string;
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, message } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (action === "process_message") {
      // Process incoming WhatsApp message
      const result = await processWhatsAppMessage(message, supabase);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "get_orders") {
      // Get recent orders for monitoring
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw new Error(`Erro ao buscar pedidos: ${error.message}`);
      }

      return new Response(JSON.stringify({ orders }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error("Ação não reconhecida");

  } catch (error) {
    console.error("Error in WhatsApp monitor:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function processWhatsAppMessage(message: WhatsAppMessage, supabase: any) {
  console.log("Processing WhatsApp message:", message);

  // Extract order information from message
  const orderInfo = extractOrderFromMessage(message.message);
  
  if (!orderInfo) {
    return { 
      success: false, 
      message: "Nenhum pedido detectado na mensagem" 
    };
  }

  // Check if customer exists
  let { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', message.phone)
    .single();

  // Create customer if doesn't exist
  if (!customer) {
    const { data: newCustomer, error: customerError } = await supabase
      .from('customers')
      .insert({
        phone: message.phone,
        name: orderInfo.customerName || 'Cliente WhatsApp',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (customerError) {
      console.error("Error creating customer:", customerError);
      return { 
        success: false, 
        message: "Erro ao criar cliente" 
      };
    }
    customer = newCustomer;
  }

  // Create cart for the order
  const { data: cart, error: cartError } = await supabase
    .from('carts')
    .insert({
      customer_phone: message.phone,
      event_date: new Date().toISOString().split('T')[0],
      event_type: 'BAZAR',
      status: 'WHATSAPP_PENDING',
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (cartError) {
    console.error("Error creating cart:", cartError);
    return { 
      success: false, 
      message: "Erro ao criar carrinho" 
    };
  }

  // Add items to cart
  for (const item of orderInfo.items) {
    // Try to find product by name or create a generic one
    let { data: product } = await supabase
      .from('products')
      .select('*')
      .ilike('name', `%${item.name}%`)
      .limit(1)
      .single();

    if (!product) {
      // Create a generic product for items not in catalog
      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert({
          name: item.name,
          code: `WPP_${Date.now()}`,
          price: item.price || 0,
          stock: 999,
          is_active: true
        })
        .select()
        .single();

      if (productError) {
        console.error("Error creating product:", productError);
        continue;
      }
      product = newProduct;
    }

    // Add to cart
    await supabase
      .from('cart_items')
      .insert({
        cart_id: cart.id,
        product_id: product.id,
        qty: item.quantity,
        unit_price: item.price || product.price
      });
  }

  return {
    success: true,
    message: "Pedido criado com sucesso",
    cartId: cart.id,
    customerId: customer.id
  };
}

function extractOrderFromMessage(message: string): any {
  // Simple regex patterns to extract order information
  // This is a basic implementation - you might want to enhance it based on your message formats
  
  const phoneRegex = /(\d{10,11})/;
  const itemRegex = /(\d+)x?\s*([^R$\d]+)(?:R?\$?\s*(\d+(?:,\d{2})?))?\s*/gi;
  const nameRegex = /nome[:\s]+([^\n\r]+)/i;
  
  const items = [];
  let match;
  
  while ((match = itemRegex.exec(message)) !== null) {
    const quantity = parseInt(match[1]) || 1;
    const name = match[2]?.trim();
    const price = match[3] ? parseFloat(match[3].replace(',', '.')) : 0;
    
    if (name && name.length > 2) {
      items.push({
        quantity,
        name,
        price
      });
    }
  }
  
  const nameMatch = message.match(nameRegex);
  const customerName = nameMatch ? nameMatch[1].trim() : null;
  
  if (items.length === 0) {
    return null;
  }
  
  return {
    items,
    customerName
  };
}