import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useTenantContext } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { 
  Bot, 
  Send, 
  Sparkles, 
  TrendingUp, 
  Users, 
  Package, 
  MessageSquare,
  Loader2,
  Copy,
  RefreshCw,
  Lightbulb
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const suggestedQuestions = [
  { icon: TrendingUp, label: "Análise de Vendas", question: "Qual foi o faturamento total e o ticket médio dos pedidos pagos?" },
  { icon: Users, label: "Top Clientes", question: "Quais são os 5 clientes que mais compraram?" },
  { icon: Package, label: "Estoque Baixo", question: "Quais produtos estão com estoque baixo e precisam de reposição?" },
  { icon: MessageSquare, label: "Criar Promoção", question: "Crie uma mensagem de promoção para enviar no WhatsApp oferecendo 15% de desconto" },
  { icon: Lightbulb, label: "Pedidos Pendentes", question: "Quantos pedidos estão pendentes de pagamento? Liste os mais antigos." },
  { icon: Sparkles, label: "Msg Cobrança", question: "Crie uma mensagem educada de cobrança para clientes com pedidos não pagos" },
];

export default function AgenteIA() {
  const { tenantId } = useTenantContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamChat = async (userMessage: string) => {
    if (!tenantId) {
      toast.error("Tenant não identificado");
      return;
    }

    const userMsg: Message = { role: "user", content: userMessage };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantContent = "";

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            message: userMessage,
            tenant_id: tenantId,
            conversation_history: messages,
          }),
        }
      );

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || "Erro na requisição");
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      const updateAssistant = (content: string) => {
        assistantContent = content;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
          }
          return [...prev, { role: "assistant", content }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              updateAssistant(assistantContent);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              updateAssistant(assistantContent);
            }
          } catch { /* ignore */ }
        }
      }

    } catch (error) {
      console.error("AI Agent error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao processar mensagem");
      // Remove user message if failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    streamChat(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (question: string) => {
    streamChat(question);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="container mx-auto p-4 max-w-5xl">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Agente de IA</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Análise de dados e criação de mensagens
                </p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearChat}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Nova conversa
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Sugestões - mostrar apenas se não houver mensagens */}
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                💡 Sugestões de perguntas:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {suggestedQuestions.map((item, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className="h-auto py-3 px-4 justify-start text-left"
                    onClick={() => handleSuggestionClick(item.question)}
                  >
                    <item.icon className="h-4 w-4 mr-2 shrink-0 text-primary" />
                    <span className="text-sm">{item.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Área de mensagens */}
          {messages.length > 0 && (
            <ScrollArea className="h-[400px] pr-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <Badge variant="secondary" className="text-xs">
                            Agente IA
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 ml-auto"
                            onClick={() => copyToClipboard(msg.content)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">
                          Analisando dados...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              placeholder="Pergunte sobre vendas, clientes, produtos ou peça para criar mensagens..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[60px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="h-auto px-4"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Powered by Lovable AI • Os dados são analisados em tempo real
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
