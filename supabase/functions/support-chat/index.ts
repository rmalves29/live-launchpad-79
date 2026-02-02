import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SupportChatRequest {
  message: string;
  tenant_id: string;
  conversation_id?: string;
  customer_phone?: string;
  customer_name?: string;
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
      conversation_id,
      customer_phone,
      customer_name
    } = await req.json() as SupportChatRequest;

    if (!message || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "message and tenant_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Buscar configurações de suporte do tenant
    const { data: settings } = await supabase
      .from("support_settings")
      .select("*")
      .eq("tenant_id", tenant_id)
      .single();

    const maxAttempts = settings?.max_attempts_before_escalation || 3;
    const humanSupportPhone = settings?.human_support_phone || "";
    const escalationMessage = settings?.escalation_message || "Estou transferindo para um atendente humano.";

    // Buscar ou criar conversa
    let currentConversationId = conversation_id;
    let failedAttempts = 0;

    if (!currentConversationId) {
      const { data: newConversation, error: convError } = await supabase
        .from("support_conversations")
        .insert({
          tenant_id,
          customer_phone,
          customer_name,
          status: "open",
          failed_attempts: 0
        })
        .select()
        .single();

      if (convError) {
        console.error("Error creating conversation:", convError);
        throw new Error("Failed to create conversation");
      }

      currentConversationId = newConversation.id;
    } else {
      // Buscar conversa existente
      const { data: existingConv } = await supabase
        .from("support_conversations")
        .select("*")
        .eq("id", currentConversationId)
        .single();

      if (existingConv) {
        failedAttempts = existingConv.failed_attempts || 0;
      }
    }

    // Salvar mensagem do usuário
    await supabase.from("support_messages").insert({
      conversation_id: currentConversationId,
      role: "user",
      content: message
    });

    // Buscar histórico da conversa
    const { data: history } = await supabase
      .from("support_messages")
      .select("role, content")
      .eq("conversation_id", currentConversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    // Buscar base de conhecimento do tenant
    const { data: knowledgeBase } = await supabase
      .from("knowledge_base")
      .select("title, content, category")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true);

    // Buscar dados do tenant para contexto
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, phone, email, company_name")
      .eq("id", tenant_id)
      .single();

    // Montar contexto da base de conhecimento
    const knowledgeContext = knowledgeBase?.map(kb => 
      `## ${kb.title} (${kb.category})\n${kb.content}`
    ).join("\n\n") || "Nenhum documento na base de conhecimento.";

    const systemPrompt = `Você é um assistente de suporte ao cliente do OrderZap - Sistema de Gestão de Pedidos via WhatsApp.

## INFORMAÇÕES DA EMPRESA:
- Nome: ${tenant?.company_name || tenant?.name || "OrderZap"}
- Telefone: ${tenant?.phone || "Não informado"}
- Email: ${tenant?.email || "Não informado"}

## BASE DE CONHECIMENTO (USE ESTAS INFORMAÇÕES PARA RESPONDER):
${knowledgeContext}

## SUAS FUNÇÕES:
1. Responder dúvidas sobre o sistema usando a base de conhecimento acima
2. Ajudar com problemas técnicos baseado nos documentos
3. Orientar sobre funcionalidades do OrderZap
4. Ser educado, profissional e objetivo

## REGRAS IMPORTANTES:
- SEMPRE tente responder usando as informações da base de conhecimento
- Se não souber a resposta, diga claramente "Não encontrei essa informação na minha base de conhecimento"
- NÃO invente informações que não estão na base de conhecimento
- Se o usuário parecer frustrado ou a pergunta for muito complexa, indique que pode transferir para um humano
- Use emojis moderadamente para ser amigável
- Responda em português brasileiro

## INDICADORES DE QUE VOCÊ NÃO CONSEGUIU AJUDAR:
- Usuário diz "não entendi", "não funcionou", "não resolveu"
- Usuário faz a mesma pergunta várias vezes
- Usuário expressa frustração
- A pergunta não está coberta na base de conhecimento

Quando detectar esses indicadores, adicione no final da sua resposta:
[PRECISA_HUMANO]`;

    const conversationHistory = history?.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content
    })) || [];

    // Chamar IA
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: message }
        ],
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
          JSON.stringify({ error: "Créditos insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI gateway error");
    }

    const aiResponse = await response.json();
    let assistantMessage = aiResponse.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";

    // Verificar se precisa escalar para humano
    const needsHuman = assistantMessage.includes("[PRECISA_HUMANO]");
    assistantMessage = assistantMessage.replace("[PRECISA_HUMANO]", "").trim();

    // Atualizar contador de tentativas falhas
    if (needsHuman) {
      failedAttempts += 1;
    } else {
      // Reset se a IA conseguiu ajudar
      failedAttempts = 0;
    }

    // Verificar se deve escalar
    let escalated = false;
    let escalationSummary = "";

    if (failedAttempts >= maxAttempts && humanSupportPhone) {
      escalated = true;

      // Gerar resumo da conversa
      const summaryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { 
              role: "system", 
              content: "Você é um assistente que resume conversas de suporte. Crie um resumo objetivo de 3-5 linhas incluindo: problema do cliente, o que foi tentado, e o que ainda precisa ser resolvido." 
            },
            { 
              role: "user", 
              content: `Resuma esta conversa de suporte:\n\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join("\n")}` 
            }
          ],
        }),
      });

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        escalationSummary = summaryData.choices?.[0]?.message?.content || "Resumo não disponível";
      }

      // Atualizar conversa como escalada
      await supabase.from("support_conversations").update({
        status: "escalated",
        escalated_at: new Date().toISOString(),
        escalated_to_phone: humanSupportPhone,
        escalation_summary: escalationSummary,
        failed_attempts: failedAttempts
      }).eq("id", currentConversationId);

      // Enviar mensagem de escalação via WhatsApp para o humano
      try {
        await supabase.functions.invoke("zapi-proxy", {
          body: {
            action: "send-text",
            tenant_id,
            phone: humanSupportPhone,
            message: `🆘 *SUPORTE ESCALADO*\n\n👤 Cliente: ${customer_name || "Não identificado"}\n📱 Telefone: ${customer_phone || "Não informado"}\n\n📋 *Resumo:*\n${escalationSummary}\n\n⏰ ${new Date().toLocaleString("pt-BR")}`
          }
        });
      } catch (whatsappError) {
        console.error("Error sending escalation to WhatsApp:", whatsappError);
      }

      // Adicionar mensagem de escalação para o usuário
      assistantMessage = `${assistantMessage}\n\n${escalationMessage}`;
    } else {
      // Atualizar contador de tentativas
      await supabase.from("support_conversations").update({
        failed_attempts: failedAttempts
      }).eq("id", currentConversationId);
    }

    // Salvar resposta do assistente
    await supabase.from("support_messages").insert({
      conversation_id: currentConversationId,
      role: "assistant",
      content: assistantMessage
    });

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        conversation_id: currentConversationId,
        escalated,
        escalation_summary: escalated ? escalationSummary : undefined,
        failed_attempts: failedAttempts
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Support chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
