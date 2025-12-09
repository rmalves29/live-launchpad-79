import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Send, Phone } from 'lucide-react';

interface WhatsAppMessage {
  id: number;
  phone: string;
  message: string;
  type: 'incoming' | 'outgoing' | 'broadcast' | 'system_log' | 'bulk' | 'mass' | 'item_added' | 'individual';
  sent_at?: string;
  received_at?: string;
  processed: boolean;
  created_at: string;
}

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333';
const API_BASE_URL = rawApiBaseUrl.replace(/\/$/, '');

export const TenantMessages = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  
  // Send message form
  const [recipient, setRecipient] = useState('');
  const [messageText, setMessageText] = useState('');

  useEffect(() => {
    if (profile?.tenant_id) {
      loadMessages();
    }
  }, [profile?.tenant_id]);

  const loadMessages = async () => {
    if (!profile?.tenant_id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar mensagens',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!recipient || !messageText || !profile?.tenant_id) {
      toast({
        title: 'Erro',
        description: 'Preencha telefone e mensagem',
        variant: 'destructive'
      });
      return;
    }

    setSendLoading(true);
    try {
      // Register message in database
      const { error: dbError } = await supabase
        .from('whatsapp_messages')
        .insert({
          phone: recipient,
          message: messageText,
          type: 'outgoing',
          tenant_id: profile.tenant_id,
          sent_at: new Date().toISOString()
        });

      if (dbError) throw dbError;

      // Try to send via WhatsApp API (mock implementation)
      try {
        const response = await fetch(`${API_BASE_URL}/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: recipient,
            message: messageText
          })
        });

        if (response.ok) {
          toast({
            title: 'Sucesso',
            description: 'Mensagem enviada com sucesso'
          });
        } else {
          toast({
            title: 'Aviso',
            description: 'Mensagem registrada, mas pode não ter sido entregue',
            variant: 'destructive'
          });
        }
      } catch (apiError) {
        console.warn('WhatsApp API error:', apiError);
        toast({
          title: 'Aviso',
          description: 'Mensagem registrada, mas pode não ter sido entregue',
          variant: 'destructive'
        });
      }

      // Clear form and reload messages
      setRecipient('');
      setMessageText('');
      loadMessages();

    } catch (error) {
      console.error('Error sending message:', error);
      // Toast de erro removido conforme solicitado
    } finally {
      setSendLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) {
      const ddd = digits.slice(2, 4);
      const number = digits.slice(4);
      if (number.length === 9) {
        return `+55 (${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
      } else if (number.length === 8) {
        return `+55 (${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
      }
    }
    return phone;
  };

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case 'incoming': return 'bg-blue-100 text-blue-800';
      case 'outgoing': return 'bg-green-100 text-green-800';
      case 'broadcast': return 'bg-purple-100 text-purple-800';
      case 'system_log': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case 'incoming': return 'Recebida';
      case 'outgoing': return 'Enviada';
      case 'broadcast': return 'Broadcast';
      case 'system_log': return 'Sistema';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Mensagens WhatsApp</h2>
      </div>

      {/* Send Message Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Enviar Mensagem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="recipient" className="block text-sm font-medium mb-1">
              Telefone do destinatário
            </label>
            <Input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="5511999999999"
            />
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium mb-1">
              Mensagem
            </label>
            <Textarea
              id="message"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Digite sua mensagem..."
              rows={3}
            />
          </div>
          <Button onClick={sendMessage} disabled={sendLoading}>
            {sendLoading ? 'Enviando...' : 'Enviar Mensagem'}
          </Button>
        </CardContent>
      </Card>

      {/* Messages History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Histórico de Mensagens</span>
            <Button onClick={loadMessages} disabled={loading} size="sm" variant="outline">
              {loading ? 'Carregando...' : 'Atualizar'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma mensagem encontrada
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((message) => (
                    <TableRow key={message.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {formatPhone(message.phone)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getMessageTypeColor(message.type)}>
                          {getMessageTypeLabel(message.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={message.message}>
                          {message.message}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(message.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
