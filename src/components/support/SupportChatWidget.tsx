import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SupportChatWidgetProps {
  tenantId: string;
  customerPhone?: string;
  customerName?: string;
}

export function SupportChatWidget({ tenantId, customerPhone, customerName }: SupportChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Estado para coleta de dados antes de escalar
  const [pendingEscalation, setPendingEscalation] = useState(false);
  const [collectedName, setCollectedName] = useState(customerName || '');
  const [collectedPhone, setCollectedPhone] = useState(customerPhone || '');
  const [originalQuestion, setOriginalQuestion] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Mensagem de boas-vindas
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
          tenant_id: tenantId,
          conversation_id: conversationId,
          customer_phone: collectedPhone || customerPhone,
          customer_name: collectedName || customerName
        }
      });

      if (error) throw error;

      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      // Verificar se precisa coletar dados antes de escalar
      if (data.needs_escalation && !data.escalated) {
        setPendingEscalation(true);
        setOriginalQuestion(userMessage.content);
        
        const collectDataMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `${data.message}\n\nPara que um atendente humano possa te ajudar melhor, preciso de algumas informações:\n\n**Por favor, informe seu nome completo:**`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, collectDataMessage]);
      } else if (data.escalated) {
        setEscalated(true);
        toast.info('Sua solicitação foi encaminhada para um atendente humano.');
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }

    } catch (error: any) {
      console.error('Support chat error:', error);
      toast.error('Erro ao enviar mensagem. Tente novamente.');
      
      // Remover mensagem do usuário em caso de erro
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
      setInput(userMessage.content);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Função para processar coleta de dados para escalação
  const handleDataCollection = async () => {
    if (!input.trim() || isLoading) return;
    
    const userInput = input.trim();
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userInput,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    // Se ainda não tem nome, coletar nome
    if (!collectedName) {
      setCollectedName(userInput);
      const askPhoneMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Obrigado, **${userInput}**! 📝\n\nAgora, por favor, informe seu **número de telefone com DDD** (ex: 31999999999):`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, askPhoneMessage]);
      return;
    }
    
    // Se já tem nome mas não tem telefone, coletar telefone e escalar
    if (!collectedPhone) {
      const phoneClean = userInput.replace(/\D/g, '');
      if (phoneClean.length < 10) {
        const invalidPhoneMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Por favor, informe um número de telefone válido com DDD (ex: 31999999999):',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, invalidPhoneMessage]);
        return;
      }
      
      setCollectedPhone(phoneClean);
      setIsLoading(true);
      
      // Agora sim, escalar com todos os dados
      try {
        const { data, error } = await supabase.functions.invoke('support-chat', {
          body: {
            message: `[ESCALAR_AGORA] Pergunta original: ${originalQuestion}`,
            tenant_id: tenantId,
            conversation_id: conversationId,
            customer_phone: phoneClean,
            customer_name: collectedName,
            original_question: originalQuestion,
            force_escalation: true
          }
        });

        if (error) throw error;

        setEscalated(true);
        setPendingEscalation(false);
        toast.info('Sua solicitação foi encaminhada para um atendente humano.');
        
        const escalatedMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: `Perfeito! ✅\n\nSuas informações foram registradas:\n- **Nome:** ${collectedName}\n- **Telefone:** ${phoneClean}\n- **Dúvida:** ${originalQuestion}\n\nUm atendente humano entrará em contato com você em breve pelo WhatsApp. Obrigado pela paciência! 🙏`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, escalatedMessage]);
        
      } catch (error: any) {
        console.error('Escalation error:', error);
        toast.error('Erro ao encaminhar. Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    }
  };
  
  const handleSendMessage = () => {
    if (pendingEscalation && (!collectedName || !collectedPhone)) {
      handleDataCollection();
    } else {
      sendMessage();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-primary hover:bg-primary/90 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110"
        aria-label="Suporte IA"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-primary-foreground" />
        ) : (
          <Bot className="w-6 h-6 text-primary-foreground" />
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 left-6 z-50 w-96 max-w-[calc(100vw-3rem)] h-[500px] max-h-[calc(100vh-8rem)] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300 flex flex-col">
          {/* Header */}
          <div className="bg-primary p-4 text-primary-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Assistente Virtual</h3>
              <p className="text-sm text-primary-foreground/80">
                {escalated ? '🔄 Transferido para humano' : '🟢 Online'}
              </p>
            </div>
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
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
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
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Um atendente humano entrará em contato em breve.
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
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Powered by OrderZap AI
            </p>
          </div>
        </div>
      )}
    </>
  );
}
