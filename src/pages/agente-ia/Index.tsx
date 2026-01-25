import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useTenantContext } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabasePublic";
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
  Lightbulb,
  Image as ImageIcon,
  X
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  image_url?: string;
}

const suggestedQuestions = [
  { icon: TrendingUp, label: "Análise de Vendas", question: "Qual foi o faturamento total e o ticket médio dos pedidos pagos?" },
  { icon: Users, label: "Top Clientes", question: "Liste os top 10 clientes em duas visões: 1) Clientes com maior NÚMERO de pedidos (ranking por quantidade de compras) e 2) Clientes com maior VALOR GASTO (ranking por total financeiro). Mostre nome, telefone e os valores de cada ranking." },
  { icon: Package, label: "Estoque Baixo", question: "Quais produtos estão com estoque baixo e precisam de reposição?" },
  { icon: Lightbulb, label: "Pedidos Pendentes", question: "Quantos pedidos estão pendentes de pagamento? Liste os mais antigos." },
  { icon: Sparkles, label: "Msg Cobrança", question: "Crie uma mensagem educada de cobrança para clientes com pedidos não pagos" },
  { icon: ImageIcon, label: "Analisar Produtos", question: "Analise as imagens dos meus produtos e sugira melhorias nas fotos", analyzeImages: true },
];

export default function AgenteIA() {
  const { tenantId } = useTenantContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione apenas arquivos de imagem");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setSelectedImage(base64);
      setImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const streamChat = async (userMessage: string, imageUrl?: string, analyzeProductImages?: boolean) => {
    if (!tenantId) {
      toast.error("Tenant não identificado");
      return;
    }

    const userMsg: Message = { 
      role: "user", 
      content: userMessage,
      image_url: imageUrl
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    removeImage();
    setIsLoading(true);

    let assistantContent = "";

    try {
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            message: userMessage,
            tenant_id: tenantId,
            conversation_history: messages.map(m => ({
              role: m.role,
              content: m.content
            })),
            image_url: imageUrl,
            analyze_product_images: analyzeProductImages,
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
    streamChat(input.trim(), selectedImage || undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (question: string, analyzeImages?: boolean) => {
    streamChat(question, undefined, analyzeImages);
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
                  Análise de dados, imagens e criação de mensagens
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
                    onClick={() => handleSuggestionClick(item.question, (item as any).analyzeImages)}
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
                      {msg.image_url && (
                        <div className="mb-2">
                          <img 
                            src={msg.image_url} 
                            alt="Imagem enviada" 
                            className="max-w-[200px] rounded-lg"
                          />
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
                          Analisando...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Preview da imagem selecionada */}
          {imagePreview && (
            <div className="relative inline-block">
              <img 
                src={imagePreview} 
                alt="Preview" 
                className="max-w-[150px] max-h-[150px] rounded-lg border"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={removeImage}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              title="Enviar imagem"
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Textarea
              ref={textareaRef}
              placeholder="Pergunte sobre vendas, clientes, produtos ou envie uma imagem para análise..."
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
            📷 Suporta análise de imagens • Powered by Lovable AI
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
