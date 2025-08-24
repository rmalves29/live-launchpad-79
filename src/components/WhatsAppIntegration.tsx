import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WhatsAppServerInstructions from '@/components/WhatsAppServerInstructions';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Smartphone, Wifi, WifiOff, Play, Pause, MessageCircle, ShoppingCart } from 'lucide-react';

interface WhatsAppMessage {
  numero: string;
  body: string;
  when: string;
  id: string;
  processed?: boolean;
}

interface WhatsAppStatus {
  state: string;
  number: string | null;
}

const WhatsAppIntegration = () => {
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [status, setStatus] = useState<WhatsAppStatus>({ state: 'disconnected', number: null });
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Função para verificar status da conexão WhatsApp
  const checkWhatsAppStatus = async () => {
    try {
      const response = await fetch(`${serverUrl}/status`);
      if (response.ok) {
        const data: WhatsAppStatus = await response.json();
        setStatus(data);
        return true;
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      setStatus({ state: 'server_offline', number: null });
    }
    return false;
  };

  // Função para buscar mensagens do servidor
  const fetchMessages = async () => {
    try {
      const response = await fetch(`${serverUrl}/messages?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.data || []);
        return data.data || [];
      }
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
    }
    return [];
  };

  // Função para processar mensagens e criar pedidos
  const processNewMessages = async () => {
    const currentMessages = await fetchMessages();
    if (!currentMessages.length) return;

    // Encontra mensagens novas (não processadas)
    let newMessages = currentMessages;
    if (lastProcessedId) {
      const lastIndex = currentMessages.findIndex(msg => msg.id === lastProcessedId);
      newMessages = lastIndex > 0 ? currentMessages.slice(0, lastIndex) : [];
    }

    if (newMessages.length === 0) return;

    console.log(`Processando ${newMessages.length} mensagens novas`);

    for (const message of newMessages) {
      await processOrderMessage(message);
    }

    // Atualiza o último ID processado
    setLastProcessedId(currentMessages[0]?.id || null);
  };

  // Função para extrair pedido da mensagem
  const extractOrderFromMessage = (message: string) => {
    // Regex para extrair itens no formato: quantidade x nome - R$ preço
    const itemRegex = /(\d+)x?\s*([^-\n\r]+?)\s*-?\s*R?\$?\s*(\d+(?:[\.,]\d{2})?)/gi;
    const items = [];
    let match;

    while ((match = itemRegex.exec(message)) !== null) {
      const [, qty, name, priceStr] = match;
      const price = parseFloat(priceStr.replace(',', '.'));
      
      if (!isNaN(price) && name.trim()) {
        items.push({
          quantity: parseInt(qty) || 1,
          name: name.trim(),
          price: price
        });
      }
    }

    // Extrai nome do cliente (procura por linhas que começam com palavras comuns)
    const nameRegex = /(?:nome|cliente|para):\s*([^\n\r]+)/i;
    const nameMatch = message.match(nameRegex);
    const customerName = nameMatch ? nameMatch[1].trim() : null;

    return items.length > 0 ? { items, customerName } : null;
  };

  // Função para processar uma mensagem e criar pedido
  const processOrderMessage = async (message: WhatsAppMessage) => {
    const orderData = extractOrderFromMessage(message.body);
    if (!orderData) return;

    try {
      // 1. Criar ou buscar cliente
      let customer;
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', message.numero)
        .single();

      if (existingCustomer) {
        customer = existingCustomer;
      } else {
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            name: orderData.customerName || `Cliente ${message.numero}`,
            phone: message.numero
          })
          .select()
          .single();

        if (customerError) {
          console.error('Erro ao criar cliente:', customerError);
          return;
        }
        customer = newCustomer;
      }

      // 2. Criar carrinho
      const { data: cart, error: cartError } = await supabase
        .from('carts')
        .insert({
          customer_phone: message.numero,
          event_date: new Date().toISOString().split('T')[0],
          event_type: 'WhatsApp',
          status: 'OPEN'
        })
        .select()
        .single();

      if (cartError) {
        console.error('Erro ao criar carrinho:', cartError);
        return;
      }

      // 3. Adicionar produtos ao carrinho
      const totalAmount = orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      for (const item of orderData.items) {
        // Buscar ou criar produto
        let product;
        const { data: existingProduct } = await supabase
          .from('products')
          .select('*')
          .ilike('name', `%${item.name}%`)
          .limit(1)
          .single();

        if (existingProduct) {
          product = existingProduct;
        } else {
          const { data: newProduct, error: productError } = await supabase
            .from('products')
            .insert({
              name: item.name,
              code: `WPP-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              price: item.price,
              stock: 1000,
              is_active: true
            })
            .select()
            .single();

          if (productError) {
            console.error('Erro ao criar produto:', productError);
            continue;
          }
          product = newProduct;
        }

        // Adicionar item ao carrinho
        await supabase
          .from('cart_items')
          .insert({
            cart_id: cart.id,
            product_id: product.id,
            qty: item.quantity,
            unit_price: item.price
          });
      }

      // 4. Criar pedido
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          cart_id: cart.id,
          customer_phone: message.numero,
          event_date: new Date().toISOString().split('T')[0],
          event_type: 'WhatsApp',
          total_amount: totalAmount,
          is_paid: false
        })
        .select()
        .single();

      if (!orderError) {
        toast.success(`Pedido criado automaticamente! Total: R$ ${totalAmount.toFixed(2)}`);
        console.log('Pedido criado:', order);
      }

    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
    }
  };

  // Função para enviar mensagem via WhatsApp
  const sendWhatsAppMessage = async (to: string, message: string) => {
    try {
      const response = await fetch(`${serverUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, message })
      });

      if (response.ok) {
        toast.success('Mensagem enviada!');
        return true;
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
    toast.error('Erro ao enviar mensagem');
    return false;
  };

  // Efeito para monitoramento automático
  useEffect(() => {
    if (isMonitoring) {
      // Verifica status a cada 10 segundos
      const statusCheck = setInterval(checkWhatsAppStatus, 10000);
      
      // Processa mensagens a cada 5 segundos
      intervalRef.current = setInterval(processNewMessages, 5000);

      return () => {
        clearInterval(statusCheck);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isMonitoring, serverUrl, lastProcessedId]);

  // Verifica status inicial
  useEffect(() => {
    checkWhatsAppStatus();
  }, [serverUrl]);

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'ready':
      case 'connected':
        return 'bg-green-500';
      case 'qr':
        return 'bg-yellow-500';
      case 'authenticated':
        return 'bg-blue-500';
      default:
        return 'bg-red-500';
    }
  };

  const getStatusText = (state: string) => {
    switch (state) {
      case 'ready':
      case 'connected':
        return 'Conectado';
      case 'qr':
        return 'Aguardando QR Code';
      case 'authenticated':
        return 'Autenticado';
      case 'starting':
        return 'Iniciando';
      case 'server_offline':
        return 'Servidor Offline';
      default:
        return 'Desconectado';
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="integration" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="integration">Integração</TabsTrigger>
          <TabsTrigger value="instructions">Instruções</TabsTrigger>
        </TabsList>

        <TabsContent value="integration">
          <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Integração WhatsApp
          </CardTitle>
          <CardDescription>
            Conecte com o servidor Node.js do WhatsApp para receber e processar pedidos automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serverUrl">URL do Servidor WhatsApp</Label>
              <Input
                id="serverUrl"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:3000"
                disabled={isMonitoring}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Status da Conexão</Label>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(status.state)}`} />
                <span className="font-medium">{getStatusText(status.state)}</span>
                {status.number && (
                  <Badge variant="outline">{status.number}</Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                id="monitoring"
                checked={isMonitoring}
                onCheckedChange={setIsMonitoring}
                disabled={status.state !== 'ready' && status.state !== 'connected'}
              />
              <Label htmlFor="monitoring" className="flex items-center gap-2">
                {isMonitoring ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                Monitoramento Automático
              </Label>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={checkWhatsAppStatus}>
                {status.state === 'server_offline' ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                Verificar Status
              </Button>
              <Button variant="outline" size="sm" onClick={fetchMessages}>
                <MessageCircle className="h-4 w-4" />
                Buscar Mensagens
              </Button>
            </div>
          </div>

          {status.state === 'qr' && (
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-yellow-800">
                <strong>QR Code necessário:</strong> Verifique o console do servidor Node.js para escanear o QR Code com seu WhatsApp.
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Mensagens Recentes</h3>
              <Badge variant="secondary">{messages.length} mensagens</Badge>
            </div>

            <ScrollArea className="h-[400px] border rounded-lg p-4">
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <p className="text-muted-foreground text-center">Nenhuma mensagem encontrada</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className="p-3 border rounded-lg space-y-2 hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{message.numero}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {new Date(message.when).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {extractOrderFromMessage(message.body) && (
                          <Badge className="bg-green-100 text-green-800">
                            <ShoppingCart className="h-3 w-3 mr-1" />
                            Pedido detectado
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{message.body}</p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="instructions">
      <WhatsAppServerInstructions />
    </TabsContent>
  </Tabs>
</div>
  );
};

export default WhatsAppIntegration;