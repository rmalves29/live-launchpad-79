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

    // Buscar TODOS os dados relevantes do tenant para contexto preciso
    const [ordersRes, productsRes, customersRes, messagesRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total_amount, is_paid, is_cancelled, created_at, event_date")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false })
        .limit(500), // Aumentado para cobrir mais dados históricos
      supabase
        .from("products")
        .select("id, name, code, price, stock, is_active, image_url, color, size")
        .eq("tenant_id", tenant_id)
        .eq("is_active", true)
        .limit(200),
      supabase
        .from("customers")
        .select("id, name, phone, created_at")
        .eq("tenant_id", tenant_id)
        .limit(500),
      supabase
        .from("whatsapp_messages")
        .select("id, phone, message, type, created_at, delivery_status")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false })
        .limit(100),
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

    // PRÉ-CALCULAR TOP CLIENTES para dados precisos
    const clientStats: Record<string, { name: string; phone: string; totalOrders: number; paidOrders: number; totalRevenue: number; paidRevenue: number }> = {};
    
    for (const order of orders) {
      const phone = order.customer_phone;
      if (!phone) continue;
      
      if (!clientStats[phone]) {
        clientStats[phone] = {
          name: order.customer_name || "Sem nome",
          phone,
          totalOrders: 0,
          paidOrders: 0,
          totalRevenue: 0,
          paidRevenue: 0
        };
      }
      
      clientStats[phone].totalOrders++;
      clientStats[phone].totalRevenue += order.total_amount || 0;
      
      if (order.is_paid && !order.is_cancelled) {
        clientStats[phone].paidOrders++;
        clientStats[phone].paidRevenue += order.total_amount || 0;
      }
      
      // Atualizar nome se disponível
      if (order.customer_name && clientStats[phone].name === "Sem nome") {
        clientStats[phone].name = order.customer_name;
      }
    }

    const clientArray = Object.values(clientStats);
    const topByOrderCount = [...clientArray].sort((a, b) => b.totalOrders - a.totalOrders).slice(0, 15);
    const topByPaidRevenue = [...clientArray].sort((a, b) => b.paidRevenue - a.paidRevenue).slice(0, 15);

    const systemPrompt = `Você é um assistente de IA especializado em análise de negócios para e-commerce e vendas via WhatsApp.
Você tem acesso aos dados do sistema e pode responder perguntas sobre pedidos, clientes, produtos e mensagens.
Você também pode ANALISAR IMAGENS quando enviadas pelo usuário.

## DADOS ATUAIS DO SISTEMA (até 500 pedidos históricos):

### MÉTRICAS RESUMIDAS:
- Total de pedidos analisados: ${totalOrders}
- Pedidos pagos: ${paidOrders}
- Pedidos pendentes: ${unpaidOrders}
- Pedidos cancelados: ${cancelledOrders}
- Faturamento total (pagos): R$ ${totalRevenue.toFixed(2)}
- Ticket médio: R$ ${averageTicket.toFixed(2)}
- Total de clientes únicos: ${clientArray.length}
- Total de mensagens WhatsApp: ${totalMessages}
- Produtos com estoque baixo (≤5): ${lowStockProducts.length}
- Produtos com imagem cadastrada: ${productsWithImages.length}

### TOP 15 CLIENTES POR NÚMERO DE PEDIDOS:
${JSON.stringify(topByOrderCount.map((c, i) => ({
  posicao: i + 1,
  nome: c.name,
  telefone: c.phone,
  total_pedidos: c.totalOrders,
  pedidos_pagos: c.paidOrders,
  receita_total: c.totalRevenue.toFixed(2),
  receita_paga: c.paidRevenue.toFixed(2)
})), null, 2)}

### TOP 15 CLIENTES POR VALOR GASTO (PAGOS):
${JSON.stringify(topByPaidRevenue.map((c, i) => ({
  posicao: i + 1,
  nome: c.name,
  telefone: c.phone,
  total_pedidos: c.totalOrders,
  pedidos_pagos: c.paidOrders,
  receita_total: c.totalRevenue.toFixed(2),
  receita_paga: c.paidRevenue.toFixed(2)
})), null, 2)}

### PEDIDOS RECENTES (últimos 30):
${JSON.stringify(orders.slice(0, 30), null, 2)}

### PRODUTOS ATIVOS (incluindo URLs de imagens):
${JSON.stringify(products.slice(0, 40), null, 2)}

### CLIENTES CADASTRADOS:
${JSON.stringify(customers.slice(0, 50), null, 2)}

### MENSAGENS WHATSAPP RECENTES:
${JSON.stringify(messages.slice(0, 30), null, 2)}

## SUAS CAPACIDADES:
1. **Análise de Pedidos**: Responder sobre vendas, faturamento, ticket médio, pedidos pendentes
2. **Análise de Clientes**: Identificar top compradores (por volume e valor), clientes inativos, frequência de compra
3. **Análise de Produtos**: Estoque baixo, produtos mais vendidos, sugestões de reposição
4. **Análise de WhatsApp**: Taxa de mensagens, horários de pico, engajamento
5. **Criação de Mensagens**: Criar textos para cobrança, follow-up, agradecimento
6. **Análise de Imagens**: Analisar imagens enviadas (produtos, comprovantes, etc.)

## INSTRUÇÕES CRÍTICAS:
- USE OS DADOS PRÉ-CALCULADOS de "TOP CLIENTES" acima para responder sobre rankings de clientes
- NÃO invente dados - use APENAS os dados fornecidos acima
- Responda sempre em português brasileiro
- Use emojis quando apropriado para deixar a resposta mais amigável
- Formate números como moeda brasileira (R$)
- Seja conciso mas completo
- Use markdown para formatar a resposta (negrito, listas, tabelas)
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
