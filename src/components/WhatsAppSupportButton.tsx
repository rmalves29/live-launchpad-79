import { useState } from 'react';
import { MessageCircle, X, Headphones, DollarSign, ShoppingCart, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SUPPORT_NUMBER = '5531992904210';

const departments = [
  { id: 'suporte', label: 'Suporte Técnico', icon: Headphones, color: 'bg-blue-500' },
  { id: 'financeiro', label: 'Financeiro', icon: DollarSign, color: 'bg-green-500' },
  { id: 'vendas', label: 'Vendas', icon: ShoppingCart, color: 'bg-purple-500' },
];

export function WhatsAppSupportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { tenantId } = useTenant();

  const handleSendMessage = async () => {
    if (!selectedDepartment || !message.trim()) {
      toast.error('Selecione um setor e escreva sua mensagem');
      return;
    }

    if (!tenantId) {
      toast.error('Tenant não identificado');
      return;
    }

    setIsSending(true);

    try {
      const dept = departments.find(d => d.id === selectedDepartment);
      const fullMessage = `*[${dept?.label}]*\n\n${message.trim()}`;

      const { data, error } = await supabase.functions.invoke('zapi-proxy', {
        body: {
          action: 'send-text',
          tenant_id: tenantId,
          phone: SUPPORT_NUMBER,
          message: fullMessage
        }
      });

      if (error) throw error;

      toast.success('Mensagem enviada! Retornaremos em breve.');
      setMessage('');
      setSelectedDepartment(null);
      setIsOpen(false);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem. Tente novamente.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110"
        aria-label="Suporte WhatsApp"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Popup */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          {/* Header */}
          <div className="bg-green-500 p-4 text-white">
            <h3 className="font-bold text-lg">Bem-vindo! 👋</h3>
            <p className="text-sm text-green-100">Fale Conosco do Order Zap</p>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione abaixo o setor e envie uma mensagem que logo te retornaremos.
            </p>

            {/* Department Selection */}
            <div className="grid grid-cols-1 gap-2">
              {departments.map((dept) => {
                const Icon = dept.icon;
                const isSelected = selectedDepartment === dept.id;
                return (
                  <button
                    key={dept.id}
                    onClick={() => setSelectedDepartment(dept.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-border hover:border-green-500/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full ${dept.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className={`font-medium ${isSelected ? 'text-green-500' : 'text-foreground'}`}>
                      {dept.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Message Input */}
            {selectedDepartment && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <Textarea
                  placeholder="Digite sua mensagem..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={isSending || !message.trim()}
                  className="w-full bg-green-500 hover:bg-green-600"
                >
                  {isSending ? (
                    'Enviando...'
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Mensagem
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
