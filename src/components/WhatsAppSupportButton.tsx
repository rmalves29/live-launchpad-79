import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, AlertCircle, Headphones, DollarSign, ShoppingBag, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTenant } from '@/hooks/useTenant';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type Department = 'menu' | 'support' | 'financial' | 'sales';

const WHATSAPP_NUMBERS = {
  financial: '5511999999999', // Número do financeiro
  sales: '5511999999999', // Número de vendas
};

export function WhatsAppSupportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [department, setDepartment] = useState<Department>('menu');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { tenant } = useTenant();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleClose = () => {
    setIsOpen(false);
    // Reset ao fechar
    setTimeout(() => {
      setDepartment('menu');
      setMessages([]);
      setConversationId(null);
      setEscalated(false);
    }, 300);
  };

  const handleDepartmentSelect = (dept: Department) => {
    if (dept === 'financial' || dept === 'sales') {
      // Redirecionar para WhatsApp
      const phone = WHATSAPP_NUMBERS[dept];
      const message = dept === 'financial' 
        ? 'Olá! Gostaria de falar com o setor Financeiro.'
        : 'Olá! Gostaria de falar com o setor de Vendas.';
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
      handleClose();
    } else if (dept === 'support') {
      // Verificar se está logado
      if (!tenant) {
        setDepartment('support'); // Mostra tela pedindo login
      } else {
        setDepartment('support');
        // Iniciar chat com mensagem de boas-vindas
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: 'Olá! 👋 Sou o assistente virtual do OrderZap. Como posso ajudar você hoje?',
          timestamp: new Date()
        }]);
      }
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !tenant) return;

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

  const renderMenu = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <h3 className="text-lg font-semibold text-foreground mb-2">Como podemos ajudar?</h3>
      <p className="text-sm text-muted-foreground text-center mb-4">
        Selecione o departamento que deseja falar:
      </p>
      
      <Button
        variant="outline"
        className="w-full justify-start gap-3 h-14 text-left"
        onClick={() => handleDepartmentSelect('support')}
      >
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Headphones className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="font-medium">Suporte Técnico</div>
          <div className="text-xs text-muted-foreground">Dúvidas sobre o sistema</div>
        </div>
      </Button>
      
      <Button
        variant="outline"
        className="w-full justify-start gap-3 h-14 text-left"
        onClick={() => handleDepartmentSelect('financial')}
      >
        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <div className="font-medium">Financeiro</div>
          <div className="text-xs text-muted-foreground">Pagamentos e assinaturas</div>
        </div>
      </Button>
      
      <Button
        variant="outline"
        className="w-full justify-start gap-3 h-14 text-left"
        onClick={() => handleDepartmentSelect('sales')}
      >
        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
          <ShoppingBag className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <div className="font-medium">Vendas</div>
          <div className="text-xs text-muted-foreground">Novos planos e upgrades</div>
        </div>
      </Button>
    </div>
  );

  const renderLoginRequired = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
        <LogIn className="w-8 h-8 text-yellow-600" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Login necessário</h3>
      <p className="text-sm text-muted-foreground text-center">
        Para acessar o suporte técnico, você precisa estar logado na sua conta.
      </p>
      <Button
        className="mt-2"
        onClick={() => {
          handleClose();
          window.location.href = '/auth';
        }}
      >
        <LogIn className="w-4 h-4 mr-2" />
        Fazer Login
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDepartment('menu')}
      >
        Voltar ao menu
      </Button>
    </div>
  );

  const renderChat = () => (
    <>
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
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            size="icon"
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex justify-between items-center mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setDepartment('menu')}
          >
            ← Voltar ao menu
          </Button>
          <p className="text-xs text-muted-foreground">
            Powered by OrderZap AI
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-primary hover:bg-primary/90 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110"
        aria-label="Suporte"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-primary-foreground" />
        ) : (
          <MessageCircle className="w-6 h-6 text-primary-foreground" />
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className={`fixed z-50 bg-card border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300 flex flex-col ${
          isMobile 
            ? 'inset-0 rounded-none' 
            : 'bottom-24 left-6 w-96 max-w-[calc(100vw-3rem)] h-[500px] max-h-[calc(100vh-8rem)] rounded-2xl'
        }`}>
          {/* Header */}
          <div className="bg-primary p-4 text-primary-foreground flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Central de Atendimento</h3>
                <p className="text-sm text-primary-foreground/80">
                  {department === 'menu' && 'Escolha um departamento'}
                  {department === 'support' && (tenant ? (escalated ? '🔄 Transferido' : '🟢 Online') : 'Login necessário')}
                </p>
              </div>
            </div>
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary-foreground/20"
                onClick={handleClose}
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Content */}
          {department === 'menu' && renderMenu()}
          {department === 'support' && !tenant && renderLoginRequired()}
          {department === 'support' && tenant && renderChat()}
        </div>
      )}
    </>
  );
}
