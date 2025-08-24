import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Users, Package, RefreshCw } from 'lucide-react';

interface Order {
  id: number;
  customer_phone: string;
  event_date: string;
  event_type: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
}

interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
  image_url?: string;
}

interface WhatsAppMessage {
  numero: string;
  body: string;
  when: string;
  id: string;
  detectedProducts?: Product[];
}

const WhatsAppMonitor = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [whatsappServerUrl, setWhatsappServerUrl] = useState('http://localhost:3000');

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-monitor', {
        body: { action: 'get_orders' }
      });

      if (error) {
        throw new Error(error.message);
      }

      setOrders(data.orders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, code, name, price, image_url')
        .eq('is_active', true);

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const formatPhoneNumber = (number: string) => {
    const digits = number.replace(/\D/g, '');
    if (digits.length >= 11) {
      const ddd = digits.slice(-11, -9);
      const phone = digits.slice(-9);
      return `${ddd}${phone}`;
    }
    return number;
  };

  const detectProductCodes = (message: string): string[] => {
    const codePattern = /C\d+/gi;
    const matches = message.match(codePattern) || [];
    return matches.map(code => code.toUpperCase());
  };

  const loadWhatsAppMessages = async () => {
    setLoadingMessages(true);
    try {
      const response = await fetch(`${whatsappServerUrl}/messages?limit=100`);
      if (!response.ok) throw new Error('Servidor WhatsApp não disponível');
      
      const result = await response.json();
      const messagesWithProducts = result.data.map((msg: any) => {
        const codes = detectProductCodes(msg.body);
        const detectedProducts = products.filter(product => 
          codes.includes(product.code.toUpperCase())
        );
        
        return {
          ...msg,
          numero: formatPhoneNumber(msg.numero),
          detectedProducts: detectedProducts.length > 0 ? detectedProducts : undefined
        };
      });

      // Filtrar apenas mensagens com produtos detectados
      const messagesWithValidProducts = messagesWithProducts.filter(
        (msg: WhatsAppMessage) => msg.detectedProducts && msg.detectedProducts.length > 0
      );

      setMessages(messagesWithValidProducts);
    } catch (error) {
      console.error('Error loading WhatsApp messages:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao conectar com servidor WhatsApp. Verifique se está rodando na porta 3000.',
        variant: 'destructive'
      });
    } finally {
      setLoadingMessages(false);
    }
  };

  const processMessage = async (message: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-monitor', {
        body: {
          action: 'process_message',
          message: {
            phone: '5511999999999', // Mock phone for demo
            message,
            timestamp: new Date().toISOString()
          }
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.success) {
        toast({
          title: 'Pedido processado',
          description: data.message
        });
        loadOrders();
      } else {
        toast({
          title: 'Aviso',
          description: data.message,
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao processar mensagem',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    loadOrders();
    loadProducts();
  }, []);

  useEffect(() => {
    if (products.length > 0) {
      loadWhatsAppMessages();
    }
  }, [products, whatsappServerUrl]);

  // Simulate monitoring toggle
  const toggleMonitoring = () => {
    setMonitoring(!monitoring);
    toast({
      title: monitoring ? 'Monitoramento pausado' : 'Monitoramento iniciado',
      description: monitoring 
        ? 'WhatsApp não está mais sendo monitorado' 
        : 'Monitorando grupos do WhatsApp para novos pedidos'
    });
  };

  return (
    <div className="container mx-auto py-6 max-w-6xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Monitor WhatsApp</h1>
        <div className="flex space-x-2">
          <Button onClick={() => { loadOrders(); loadWhatsAppMessages(); }} variant="outline" disabled={loading || loadingMessages}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button 
            onClick={toggleMonitoring}
            variant={monitoring ? "destructive" : "default"}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            {monitoring ? 'Pausar Monitor' : 'Iniciar Monitor'}
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={monitoring ? "default" : "secondary"}>
                {monitoring ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Monitor de grupos WhatsApp
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens c/ Produtos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {messages.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Com códigos de produtos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Hoje</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders.filter(order => 
                new Date(order.created_at).toDateString() === new Date().toDateString()
              ).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Novos pedidos via WhatsApp
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Não Pagos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders.filter(order => !order.is_paid).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Aguardando pagamento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Test Message Processing */}
      <Card>
        <CardHeader>
          <CardTitle>Teste de Processamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Teste o processamento automático de mensagens do WhatsApp com códigos de produtos:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button 
                onClick={() => processMessage("C001 C002 - Nome: Maria Silva")}
                variant="outline"
                className="h-auto p-4 text-left"
              >
                <div>
                  <div className="font-medium">Testar com Códigos</div>
                  <div className="text-sm text-muted-foreground">
                    "C001 C002 - Nome: Maria Silva"
                  </div>
                </div>
              </Button>
              
              <Button 
                onClick={() => processMessage("1x C003 - Nome: Ana Costa")}
                variant="outline" 
                className="h-auto p-4 text-left"
              >
                <div>
                  <div className="font-medium">Testar Código Único</div>
                  <div className="text-sm text-muted-foreground">
                    "1x C003 - Nome: Ana Costa"
                  </div>
                </div>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages with Product Codes */}
      <Card>
        <CardHeader>
          <CardTitle>Monitor de Pedidos - Mensagens com Produtos</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {loadingMessages ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando mensagens...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma mensagem com códigos de produtos encontrada
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className="p-6 border rounded-lg bg-card space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="font-bold text-lg text-primary">
                          {formatPhoneNumber(message.numero)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(message.when).toLocaleString('pt-BR')}
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-muted/30 p-4 rounded-lg text-sm">
                      <div className="font-medium mb-2">Mensagem:</div>
                      {message.body}
                    </div>

                    {message.detectedProducts && message.detectedProducts.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-sm font-bold">Produtos Detectados:</div>
                        <div className="grid gap-4">
                          {message.detectedProducts.map((product) => (
                            <div key={product.id} className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                              {product.image_url ? (
                                <img 
                                  src={product.image_url} 
                                  alt={product.name}
                                  className="w-16 h-16 object-cover rounded-md border"
                                />
                              ) : (
                                <div className="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center">
                                  <Package className="w-8 h-8 text-gray-400" />
                                </div>
                              )}
                              
                              <div className="flex-1 space-y-1">
                                <div className="font-bold text-lg">{product.code}</div>
                                <div className="font-medium text-gray-700">{product.name}</div>
                                <div className="font-bold text-green-700 text-lg">
                                  R$ {product.price.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Como Usar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong>Códigos de Produtos:</strong> O sistema detecta códigos no formato "C1231" nas mensagens do WhatsApp</p>
            <p>• <strong>Detecção Automática:</strong> Busca produtos cadastrados que correspondem aos códigos encontrados</p>
            <p>• <strong>Números Formatados:</strong> Mostra números no padrão DDD + telefone (31992904210)</p>
            <p>• <strong>Informações do Produto:</strong> Exibe código, nome, foto e preço dos produtos detectados</p>
            <p>• <strong>Servidor WhatsApp:</strong> Certifique-se de que o servidor Node.js está rodando na porta 3000</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppMonitor;