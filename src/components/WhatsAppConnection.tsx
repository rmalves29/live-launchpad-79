import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { MessageSquare, Send, Package, CreditCard, X, RefreshCw } from 'lucide-react';

interface WhatsAppMessage {
  id: number;
  phone: string;
  message: string;
  type: string;
  product_name?: string;
  order_id?: number;
  amount?: number;
  sent_at?: string;
  received_at?: string;
  processed?: boolean;
  created_at: string;
}

const WhatsAppConnection = () => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');

  const loadMessages = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('whatsapp-connection', {
        body: { action: 'get_messages' }
      });
      
      if (data?.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar mensagens do WhatsApp",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendProductMessage = async () => {
    if (!testPhone) {
      toast({
        title: "Erro",
        description: "Informe o telefone",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data } = await supabase.functions.invoke('whatsapp-connection', {
        body: {
          action: 'send_product_message',
          data: {
            phone: testPhone,
            productName: 'Produto Teste'
          }
        }
      });

      if (data?.success) {
        toast({
          title: "Sucesso",
          description: "Mensagem de produto enviada",
        });
        loadMessages();
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast({
        title: "Erro",
        description: "Erro ao enviar mensagem",
        variant: "destructive",
      });
    }
  };

  const sendPaymentRequest = async () => {
    if (!testPhone) {
      toast({
        title: "Erro",
        description: "Informe o telefone",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data } = await supabase.functions.invoke('whatsapp-connection', {
        body: {
          action: 'send_payment_request',
          data: {
            phone: testPhone,
            orderId: 123,
            amount: 49.90
          }
        }
      });

      if (data?.success) {
        toast({
          title: "Sucesso",
          description: "Cobrança enviada",
        });
        loadMessages();
      }
    } catch (error) {
      console.error('Erro ao enviar cobrança:', error);
      toast({
        title: "Erro",
        description: "Erro ao enviar cobrança",
        variant: "destructive",
      });
    }
  };

  const sendCancellation = async () => {
    if (!testPhone) {
      toast({
        title: "Erro",
        description: "Informe o telefone",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data } = await supabase.functions.invoke('whatsapp-connection', {
        body: {
          action: 'send_cancellation',
          data: {
            phone: testPhone,
            orderId: 123
          }
        }
      });

      if (data?.success) {
        toast({
          title: "Sucesso",
          description: "Cancelamento enviado",
        });
        loadMessages();
      }
    } catch (error) {
      console.error('Erro ao enviar cancelamento:', error);
      toast({
        title: "Erro",
        description: "Erro ao enviar cancelamento",
        variant: "destructive",
      });
    }
  };

  const processManualOrder = async () => {
    if (!testPhone || !testMessage) {
      toast({
        title: "Erro",
        description: "Informe telefone e mensagem",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data } = await supabase.functions.invoke('whatsapp-connection', {
        body: {
          action: 'process_manual_order',
          data: {
            phone: testPhone,
            message: testMessage
          }
        }
      });

      if (data?.success) {
        toast({
          title: "Sucesso",
          description: "Pedido manual processado",
        });
        loadMessages();
        setTestMessage('');
      }
    } catch (error) {
      console.error('Erro ao processar pedido:', error);
      toast({
        title: "Erro",
        description: "Erro ao processar pedido manual",
        variant: "destructive",
      });
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'product_selected': return <Package className="h-4 w-4" />;
      case 'payment_request': return <CreditCard className="h-4 w-4" />;
      case 'order_cancelled': return <X className="h-4 w-4" />;
      case 'manual_order': return <MessageSquare className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getMessageBadgeColor = (type: string) => {
    switch (type) {
      case 'product_selected': return 'bg-blue-500';
      case 'payment_request': return 'bg-green-500';
      case 'order_cancelled': return 'bg-red-500';
      case 'manual_order': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Conexão WhatsApp
          </CardTitle>
          <CardDescription>
            Sistema para envio de mensagens e processamento de pedidos via WhatsApp
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="messages" className="space-y-4">
        <TabsList>
          <TabsTrigger value="messages">Mensagens</TabsTrigger>
          <TabsTrigger value="send">Enviar Mensagem</TabsTrigger>
          <TabsTrigger value="manual">Pedidos Manuais</TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Histórico de Mensagens</CardTitle>
                <Button onClick={loadMessages} disabled={loading} size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.map((msg) => (
                  <div key={msg.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getMessageIcon(msg.type)}
                        <span className="font-medium">{msg.phone}</span>
                        <Badge className={`text-white ${getMessageBadgeColor(msg.type)}`}>
                          {msg.type.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm bg-muted p-2 rounded whitespace-pre-wrap">
                      {msg.message}
                    </p>
                    {msg.product_name && (
                      <p className="text-sm text-blue-600">Produto: {msg.product_name}</p>
                    )}
                    {msg.order_id && (
                      <p className="text-sm text-green-600">Pedido: #{msg.order_id}</p>
                    )}
                    {msg.amount && (
                      <p className="text-sm text-green-600">Valor: R$ {msg.amount.toFixed(2)}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="send">
          <Card>
            <CardHeader>
              <CardTitle>Enviar Mensagens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Telefone (com DDD)</label>
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="11999999999"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button onClick={sendProductMessage} className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Produto Selecionado
                </Button>
                
                <Button onClick={sendPaymentRequest} className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Enviar Cobrança
                </Button>
                
                <Button onClick={sendCancellation} variant="destructive" className="flex items-center gap-2">
                  <X className="h-4 w-4" />
                  Cancelamento
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Processar Pedidos Manuais</CardTitle>
              <CardDescription>
                Simule o recebimento de mensagens de clientes para criar pedidos manuais
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Telefone do Cliente</label>
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="11999999999"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Mensagem do Cliente</label>
                <Textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="2x Camiseta R$ 25,00&#10;1x Calça R$ 80,00&#10;Nome: João Silva"
                  className="min-h-24"
                />
              </div>
              
              <Button onClick={processManualOrder} className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                Processar Pedido Manual
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WhatsAppConnection;