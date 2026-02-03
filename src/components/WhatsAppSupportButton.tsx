import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useTenant } from '@/hooks/useTenant';
import { useIsMobile } from '@/hooks/use-mobile';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function WhatsAppSupportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { tenant } = useTenant();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: 'Olá! 👋 Sou o assistente virtual do OrderZap. Como posso ajudar você hoje?',
        timestamp: new Date()
      }]);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    if (!tenant?.id) {
      toast.error('Tenant não identificado. Faça login novamente.');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('support-chat', {
        body: {
          message: userMessage.content,
          tenant_id: tenant.id,
          conversation_id: conversationId,
          customer_phone: tenant.phone,
          customer_name: tenant.name
        }
      });

      if (error) throw error;

      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      if (data.escalated) {
        setEscalated(true);
        toast.info('Sua solicitação foi encaminhada para um atendente humano.');
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error: any) {
      console.error('Support chat error:', error);
      toast.error('Erro ao enviar mensagem. Tente novamente.');
      
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
      setInput(userMessage.content);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setMessages([]);
    setConversationId(null);
    setEscalated(false);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 group"
        aria-label="Suporte IA"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-primary-foreground" />
        ) : (
          <div className="relative">
            <Bot className="w-6 h-6 text-primary-foreground" />
            <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-accent animate-pulse" />
          </div>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div 
          className={`fixed z-50 bg-card border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300 flex flex-col ${
            isMobile 
              ? 'inset-0 rounded-none' 
              : 'bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] h-[500px] max-h-[calc(100vh-8rem)] rounded-2xl'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-primary/80 p-4 text-primary-foreground flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Assistente OrderZap</h3>
                <p className="text-sm text-primary-foreground/80">
                  {escalated ? '🔄 Transferido para humano' : '🟢 Online'}
                </p>
              </div>
            </div>
            {isMobile && (
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-primary-foreground/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm">{message.content}</p>
                    )}
                    <p className={`text-xs mt-1 ${message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              {escalated && (
                <div className="flex items-center gap-2 p-3 bg-accent/10 border border-accent/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-accent flex-shrink-0" />
                  <p className="text-sm text-accent-foreground">
                    Um atendente humano entrará em contato em breve via WhatsApp.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border bg-background">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={resetChat}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Nova conversa
              </button>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Powered by OrderZap AI
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
