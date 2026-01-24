import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgentRequest {
  message: string;
  tenant_id: string;
  conversation_history?: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
  image_url?: string; // URL da imagem enviada pelo usuário
  analyze_product_images?: boolean; // Se true, inclui imagens dos produtos na análise
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { 
      message, 
      tenant_id, 
      conversation_history = [],
      image_url,
      analyze_product_images = false
    } = await req.json() as AgentRequest;

    if (!message || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "message and tenant_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Buscar dados relevantes do tenant para contexto
    const [ordersRes, productsRes, customersRes, messagesRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total_amount, is_paid, is_cancelled, created_at, event_date")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("products")
        .select("id, name, code, price, stock, is_active, image_url, color, size")
        .eq("tenant_id", tenant_id)
        .eq("is_active", true)
        .limit(100),
      supabase
        .from("customers")
        .select("id, name, phone, created_at")
        .eq("tenant_id", tenant_id)
        .limit(100),
      supabase
        .from("whatsapp_messages")
        .select("id, phone, message, type, created_at, delivery_status")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const orders = ordersRes.data || [];
    const products = productsRes.data || [];
    const customers = customersRes.data || [];
    const messages = messagesRes.data || [];

    // Calcular métricas para contexto
    const totalOrders = orders.length;
    const paidOrders = orders.filter(o => o.is_paid && !o.is_cancelled).length;
    const unpaidOrders = orders.filter(o => !o.is_paid && !o.is_cancelled).length;
    const cancelledOrders = orders.filter(o => o.is_cancelled).length;
    const totalRevenue = orders.filter(o => o.is_paid && !o.is_cancelled).reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const averageTicket = paidOrders > 0 ? totalRevenue / paidOrders : 0;
    const lowStockProducts = products.filter(p => p.stock <= 5);
    const totalCustomers = customers.length;
    const totalMessages = messages.length;
    const productsWithImages = products.filter(p => p.image_url);

    const systemPrompt = `Você é um assistente de IA especializado em análise de negócios para e-commerce e vendas via WhatsApp.
Você tem acesso aos dados do sistema e pode responder perguntas sobre pedidos, clientes, produtos e mensagens.
Você também pode ANALISAR IMAGENS quando enviadas pelo usuário.

## DADOS ATUAIS DO SISTEMA (últimos 50 registros de cada):

### MÉTRICAS RESUMIDAS:
- Total de pedidos: ${totalOrders}
- Pedidos pagos: ${paidOrders}
- Pedidos pendentes: ${unpaidOrders}
- Pedidos cancelados: ${cancelledOrders}
- Faturamento total: R$ ${totalRevenue.toFixed(2)}
- Ticket médio: R$ ${averageTicket.toFixed(2)}
- Total de clientes: ${totalCustomers}
- Total de mensagens WhatsApp: ${totalMessages}
- Produtos com estoque baixo (≤5): ${lowStockProducts.length}
- Produtos com imagem cadastrada: ${productsWithImages.length}

### PEDIDOS RECENTES:
${JSON.stringify(orders.slice(0, 20), null, 2)}

### PRODUTOS ATIVOS (incluindo URLs de imagens):
${JSON.stringify(products.slice(0, 30), null, 2)}

### CLIENTES:
${JSON.stringify(customers.slice(0, 30), null, 2)}

### MENSAGENS WHATSAPP RECENTES:
${JSON.stringify(messages.slice(0, 20), null, 2)}

## SUAS CAPACIDADES:
1. **Análise de Pedidos**: Responder sobre vendas, faturamento, ticket médio, pedidos pendentes
2. **Análise de Clientes**: Identificar top compradores, clientes inativos, frequência de compra
3. **Análise de Produtos**: Estoque baixo, produtos mais vendidos, sugestões de reposição
4. **Análise de WhatsApp**: Taxa de mensagens, horários de pico, engajamento
5. **Criação de Mensagens**: Criar textos para campanhas, promoções, cobrança, follow-up
6. **Análise de Imagens**: Analisar imagens enviadas (produtos, comprovantes, etc.)

## INSTRUÇÕES:
- Responda sempre em português brasileiro
- Use emojis quando apropriado para deixar a resposta mais amigável
- Formate números como moeda brasileira (R$)
- Seja conciso mas completo
- Se o usuário pedir para criar uma mensagem, forneça o texto pronto para copiar
- Use markdown para formatar a resposta (negrito, listas, etc.)
- Quando criar mensagens para WhatsApp, use formatação compatível (*negrito*, _itálico_)
- Se uma imagem for enviada, analise-a detalhadamente e relacione com os dados do sistema quando relevante`;

    // Construir a mensagem do usuário (pode incluir imagem)
    let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    
    if (image_url) {
      // Mensagem com imagem
      userContent = [
        { type: "text", text: message },
        { type: "image_url", image_url: { url: image_url } }
      ];
    } else if (analyze_product_images && productsWithImages.length > 0) {
      // Incluir imagens de produtos para análise
      const productImages = productsWithImages.slice(0, 5).map(p => ({
        type: "image_url" as const,
        image_url: { url: p.image_url! }
      }));
      userContent = [
        { type: "text", text: `${message}\n\n(Analisando imagens dos produtos: ${productsWithImages.slice(0, 5).map(p => p.name).join(", ")})` },
        ...productImages
      ];
    } else {
      userContent = message;
    }

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...conversation_history.slice(-10), // Últimas 10 mensagens para contexto
      { role: "user", content: userContent }
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro no gateway de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Retornar stream
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("AI Agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
