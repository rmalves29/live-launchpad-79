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
  const [filteredMessages, setFilteredMessages] = useState<WhatsAppMessage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [whatsappServerUrl, setWhatsappServerUrl] = useState('http://localhost:3000');
  const [searchFilter, setSearchFilter] = useState('');

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
    // Remove country code 55 if present
    const national = digits.startsWith('55') ? digits.slice(2) : digits;

    if (national.length >= 10) {
      const ddd = national.slice(0, 2);
      let local = national.slice(2);
      // Ensure 9th digit for mobile numbers if missing (8-digit local)
      if (local.length === 8) {
        local = '9' + local;
      } else if (local.length > 9) {
        local = local.slice(-9);
      }
      return `${ddd}${local}`;
    }
    return national;
  };

  const normalizePhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    // Work with national number (strip country code if present)
    let national = digits.startsWith('55') ? digits.slice(2) : digits;
    if (national.length < 10) {
      // Fallback: if too short, just prefix 55 to whatever we have
      return digits.startsWith('55') ? digits : `55${national}`;
    }
    const ddd = national.slice(0, 2);
    let local = national.slice(2);
    if (local.length === 8) {
      local = '9' + local; // ensure 9th digit
    } else if (local.length > 9) {
      local = local.slice(-9);
    }
    return `55${ddd}${local}`;
  };

  const createAutomaticOrder = async (message: WhatsAppMessage) => {
    if (!message.detectedProducts || message.detectedProducts.length === 0) {
      return;
    }

    const normalizedPhone = normalizePhone(message.numero);
    if (normalizedPhone.length < 12 || normalizedPhone.length > 15) {
      console.error('Invalid phone number:', message.numero);
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    try {
      // Function to get or create order with retry logic
      const getOrCreateOrder = async (): Promise<{ orderId: number; cartId: number | null; isNew: boolean }> => {
        // First attempt: Check for existing unpaid order
        const { data: existingOrders, error: searchError } = await supabase
          .from('orders')
          .select('*')
          .eq('customer_phone', normalizedPhone)
          .eq('event_date', today)
          .eq('is_paid', false)
          .order('created_at', { ascending: false });

        if (searchError) {
          console.error('Error searching for existing order:', searchError);
          throw searchError;
        }

        if (existingOrders && existingOrders.length > 0) {
          return { 
            orderId: existingOrders[0].id, 
            cartId: existingOrders[0].cart_id, 
            isNew: false 
          };
        }

        // Try to create new order
        try {
          const totalAmount = message.detectedProducts!.reduce((sum, product) => sum + product.price, 0);
          
          const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert([{
              customer_phone: normalizedPhone,
              event_type: 'WHATSAPP',
              event_date: today,
              total_amount: totalAmount,
              is_paid: false
            }])
            .select()
            .single();

          if (orderError) {
            // If unique constraint violation, retry to find existing order
            if (orderError.code === '23505') {
              console.log('Unique constraint violation, retrying to find existing order...');
              const { data: retryOrders, error: retryError } = await supabase
                .from('orders')
                .select('*')
                .eq('customer_phone', normalizedPhone)
                .eq('event_date', today)
                .eq('is_paid', false)
                .order('created_at', { ascending: false })
                .limit(1);

              if (retryError) throw retryError;
              if (retryOrders && retryOrders.length > 0) {
                return { 
                  orderId: retryOrders[0].id, 
                  cartId: retryOrders[0].cart_id, 
                  isNew: false 
                };
              }
            }
            throw orderError;
          }

          return { 
            orderId: newOrder.id, 
            cartId: null, 
            isNew: true 
          };
        } catch (error) {
          throw error;
        }
      };

      const { orderId, cartId: initialCartId, isNew } = await getOrCreateOrder();
      let cartId = initialCartId;

      // Create cart if needed
      if (!cartId) {
        const { data: newCart, error: cartError } = await supabase
          .from('carts')
          .insert({
            customer_phone: normalizedPhone,
            event_type: 'WHATSAPP',
            event_date: today,
            status: 'OPEN'
          })
          .select()
          .single();

        if (cartError) throw cartError;
        cartId = newCart.id;

        // Update order with cart_id
        await supabase
          .from('orders')
          .update({ cart_id: cartId })
          .eq('id', orderId);
      }

      // Add all detected products to cart
      let orderTotal = 0;
      
      for (const product of message.detectedProducts) {
        // Check if product already exists in cart
        const { data: existingCartItem, error: cartItemSearchError } = await supabase
          .from('cart_items')
          .select('*')
          .eq('cart_id', cartId)
          .eq('product_id', product.id)
          .maybeSingle();

        if (cartItemSearchError && cartItemSearchError.code !== 'PGRST116') {
          throw cartItemSearchError;
        }

        if (existingCartItem) {
          // Update quantity and price
          const newQty = existingCartItem.qty + 1;
          const { error: updateError } = await supabase
            .from('cart_items')
            .update({ 
              qty: newQty,
              unit_price: product.price 
            })
            .eq('id', existingCartItem.id);

          if (updateError) throw updateError;
          orderTotal += product.price;
        } else {
          // Create new cart item
          const { error: cartItemError } = await supabase
            .from('cart_items')
            .insert({
              cart_id: cartId,
              product_id: product.id,
              qty: 1,
              unit_price: product.price
            });

          if (cartItemError) throw cartItemError;
          orderTotal += product.price;
        }
      }

      // Update order total if needed
      if (orderTotal > 0) {
        if (isNew) {
          // Order was just created with correct total
        } else {
          // Update existing order total
          const { data: currentOrder } = await supabase
            .from('orders')
            .select('total_amount')
            .eq('id', orderId)
            .single();

          if (currentOrder) {
            const newTotal = currentOrder.total_amount + orderTotal;
            await supabase
              .from('orders')
              .update({ total_amount: newTotal })
              .eq('id', orderId);
          }
        }
      }

      toast({
        title: 'Pedido Criado',
        description: `Pedido automático criado para ${formatPhoneNumber(message.numero)} - ${message.detectedProducts.length} produto(s)`,
      });

      console.log('Automatic order created successfully for phone:', normalizedPhone);
      
      // Force reload orders to show the new one
      setTimeout(() => {
        loadOrders();
      }, 1000);

    } catch (error) {
      console.error('Error creating automatic order:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao criar pedido automático',
        variant: 'destructive'
      });
    }
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

      // Check for new messages and create orders automatically
      const newMessages = messagesWithValidProducts.filter(msg => 
        !messages.find(existingMsg => existingMsg.id === msg.id)
      );

      // Create automatic orders for new messages with detected products
      for (const message of newMessages) {
        if (message.detectedProducts && message.detectedProducts.length > 0) {
          console.log('Creating automatic order for message:', message.id, 'from:', message.numero);
          await createAutomaticOrder(message);
        }
      }

      setMessages(messagesWithValidProducts);
      setFilteredMessages(messagesWithValidProducts);
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

  const filterMessages = (filter: string) => {
    setSearchFilter(filter);
    if (!filter.trim()) {
      setFilteredMessages(messages);
      return;
    }

    const filtered = messages.filter(msg => {
      const phoneMatch = msg.numero.includes(filter);
      const productCodeMatch = msg.detectedProducts?.some(product => 
        product.code.toLowerCase().includes(filter.toLowerCase())
      );
      const messageMatch = msg.body.toLowerCase().includes(filter.toLowerCase());
      
      return phoneMatch || productCodeMatch || messageMatch;
    });

    setFilteredMessages(filtered);
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

  useEffect(() => {
    filterMessages(searchFilter);
  }, [messages]);


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
      <div className="flex justify-between items-center mb-6">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
            <CardTitle className="text-sm font-medium">Filtradas</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredMessages.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Mensagens exibidas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search Filter */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtrar Mensagens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar por telefone ou código de produto..."
              value={searchFilter}
              onChange={(e) => filterMessages(e.target.value)}
              className="flex-1 px-3 py-2 border border-input bg-background rounded-md text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {searchFilter && (
              <Button 
                variant="outline" 
                onClick={() => filterMessages('')}
                className="px-3"
              >
                Limpar
              </Button>
            )}
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
              ) : filteredMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchFilter ? 'Nenhuma mensagem encontrada com o filtro aplicado' : 'Nenhuma mensagem com códigos de produtos encontrada'}
                </div>
              ) : (
                filteredMessages.map((message) => (
                  <div key={message.id} className="p-4 border rounded-lg bg-card space-y-3">
                     <div className="flex justify-between items-start">
                       <div className="space-y-1">
                         <div className="text-sm text-muted-foreground">
                           {message.numero} - {new Date(message.when).toLocaleString('pt-BR')}
                         </div>
                       </div>
                     </div>
                    
                    <div className="bg-muted/30 p-3 rounded text-sm">
                      <div className="font-medium mb-1">Mensagem:</div>
                      {message.body}
                    </div>

                    {message.detectedProducts && message.detectedProducts.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Produtos Detectados:</div>
                        <div className="space-y-2">
                          {message.detectedProducts.map((product) => (
                            <div key={product.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                              <div className="flex items-center gap-3">
                                {product.image_url ? (
                                  <img 
                                    src={product.image_url} 
                                    alt={product.name}
                                    className="w-12 h-12 object-cover rounded border"
                                  />
                                ) : (
                                  <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                                    <Package className="w-6 h-6 text-gray-400" />
                                  </div>
                                )}
                                
                                <div>
                                  <div className="font-bold text-green-700">
                                    {product.code} - {product.name} - R$ {product.price.toFixed(2)}
                                  </div>
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
            <p>• <strong>Filtro de Busca:</strong> Use o campo de busca para filtrar por número de telefone ou código de produto</p>
            <p>• <strong>Códigos de Produtos:</strong> O sistema detecta códigos no formato "C1231" nas mensagens do WhatsApp</p>
            <p>• <strong>Layout Otimizado:</strong> Informações exibidas no formato "C1231 - teste - R$2.00"</p>
            <p>• <strong>Números Formatados:</strong> Telefones no padrão DDD + 9 + número (31992904210)</p>
            <p>• <strong>Criação Automática:</strong> Pedidos são criados automaticamente quando códigos de produtos são detectados</p>
            <p>• <strong>Servidor WhatsApp:</strong> Certifique-se de que o servidor Node.js está rodando na porta 3000</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppMonitor;