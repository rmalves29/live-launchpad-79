import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Copy, User, MapPin, Truck, Search, ShoppingCart, ArrowLeft, BarChart3, CreditCard, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface OrderItem {
  id: number;
  product_name: string;
  product_code: string;
  qty: number;
  unit_price: number;
  image_url?: string;
}

interface Order {
  id: number;
  customer_phone: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  items: OrderItem[];
}

interface CustomerData {
  name: string;
  cpf: string;
}

const Checkout = () => {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOpenOrders, setLoadingOpenOrders] = useState(false);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'checkout'>('dashboard');

  const loadOpenOrders = async () => {
    if (!phone) {
      toast({
        title: 'Erro',
        description: 'Informe o telefone do cliente',
        variant: 'destructive'
      });
      return;
    }

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    setLoadingOpenOrders(true);
    
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_phone', normalizedPhone)
        .eq('is_paid', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load cart items for each order
      const ordersWithItems = await Promise.all(
        (orders || []).map(async (order) => {
          if (!order.cart_id) {
            return { ...order, items: [] };
          }

          const { data: cartItems, error: itemsError } = await supabase
            .from('cart_items')
            .select(`
              id,
              qty,
              unit_price,
              product:products!cart_items_product_id_fkey(
                name,
                code,
                image_url
              )
            `)
            .eq('cart_id', order.cart_id);

          if (itemsError) {
            console.error('Error loading cart items:', itemsError);
            return { ...order, items: [] };
          }

          const items = (cartItems || []).map(item => ({
            id: item.id,
            product_name: item.product?.name || '',
            product_code: item.product?.code || '',
            qty: item.qty,
            unit_price: Number(item.unit_price),
            image_url: item.product?.image_url
          }));

          return { ...order, items };
        })
      );

      setOpenOrders(ordersWithItems);
      
      if (orders.length === 0) {
        toast({
          title: 'Nenhum pedido encontrado',
          description: 'Este cliente não possui pedidos em aberto'
        });
      }
    } catch (error) {
      console.error('Error loading open orders:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pedidos em aberto',
        variant: 'destructive'
      });
    } finally {
      setLoadingOpenOrders(false);
    }
  };

  const finalizarPedido = (orderId: number) => {
    // Navegar para a mesma página mas com foco no pedido específico
    window.location.href = `/checkout?pedido=${orderId}`;
  };

  const loadCustomerHistory = async () => {
    if (!phone) {
      toast({
        title: 'Erro',
        description: 'Informe o telefone do cliente',
        variant: 'destructive'
      });
      return;
    }

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    setLoadingHistory(true);
    
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_phone', normalizedPhone)
        .eq('is_paid', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load cart items for each order
      const ordersWithItems = await Promise.all(
        (orders || []).map(async (order) => {
          if (!order.cart_id) {
            return { ...order, items: [] };
          }

          const { data: cartItems, error: itemsError } = await supabase
            .from('cart_items')
            .select(`
              id,
              qty,
              unit_price,
              product:products!cart_items_product_id_fkey(
                name,
                code,
                image_url
              )
            `)
            .eq('cart_id', order.cart_id);

          if (itemsError) {
            console.error('Error loading cart items:', itemsError);
            return { ...order, items: [] };
          }

          const items = (cartItems || []).map(item => ({
            id: item.id,
            product_name: item.product?.name || '',
            product_code: item.product?.code || '',
            qty: item.qty,
            unit_price: Number(item.unit_price),
            image_url: item.product?.image_url
          }));

          return { ...order, items };
        })
      );

      setCustomerOrders(ordersWithItems);
      setActiveView('history');
      
      if (orders.length === 0) {
        toast({
          title: 'Nenhum pedido encontrado',
          description: 'Este cliente não possui histórico de pedidos'
        });
      }
    } catch (error) {
      console.error('Error loading order history:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar histórico de pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const renderCheckoutView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Finalizar Checkout</h2>
        <Button onClick={() => setActiveView('dashboard')} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Dashboard
        </Button>
      </div>
      
      <p className="text-muted-foreground mb-6">Processe pagamentos e finalize pedidos</p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            Buscar Pedidos em Aberto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Telefone do cliente"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1"
            />
            <Button onClick={loadOpenOrders} disabled={loadingOpenOrders}>
              {loadingOpenOrders ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Buscar Pedidos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Área de pedidos encontrados */}
      <div className="mt-8">
        <p className="text-lg font-bold text-red-600 mb-4">
          SELECIONE O PEDIDO PARA FINALIZAR
        </p>
        
        {/* Lista de pedidos em aberto */}
        {openOrders.length > 0 ? (
          <div className="space-y-4">
            {openOrders.map((order) => (
              <Card key={order.id} className="hover:shadow-lg transition-shadow border-2 border-orange-200">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center">
                        Pedido #{order.id}
                        <Badge variant="outline" className="ml-2 bg-orange-100 text-orange-800 border-orange-200">
                          MANUAL
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Data: {new Date(order.event_date).toLocaleDateString('pt-BR')} • {order.event_type}
                      </CardDescription>
                      <div className="mt-2">
                        <p className="text-sm font-medium">Produtos do Pedido:</p>
                        {order.items.map((item, index) => (
                          <div key={index} className="flex items-center mt-2 p-2 bg-gray-50 rounded">
                            {item.image_url && (
                              <img 
                                src={item.image_url} 
                                alt={item.product_name}
                                className="w-10 h-10 object-cover rounded mr-3"
                              />
                            )}
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.product_code} - {item.product_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Quantidade: {item.qty} • Preço unitário: R$ {Number(item.unit_price).toFixed(2)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold">R$ {(item.qty * Number(item.unit_price)).toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-primary">R$ {Number(order.total_amount).toFixed(2)}</div>
                      <div className="text-sm text-muted-foreground">{order.items.length} item(ns)</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Opções de Frete</h4>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <input type="radio" id={`retirada-${order.id}`} name={`frete-${order.id}`} className="mr-3" defaultChecked />
                          <label htmlFor={`retirada-${order.id}`} className="font-medium">Retirada - Retirar na Fábrica</label>
                          <p className="text-sm text-muted-foreground ml-6">Entrega em até 3 dias úteis</p>
                        </div>
                        <span className="font-bold">R$ 0,00</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <input type="radio" id={`pac-${order.id}`} name={`frete-${order.id}`} className="mr-3" />
                          <label htmlFor={`pac-${order.id}`} className="font-medium">Correios - PAC</label>
                          <p className="text-sm text-muted-foreground ml-6">Entrega em até 10 dias úteis</p>
                        </div>
                        <span className="font-bold">R$ 29,56</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <input type="radio" id={`sedex-${order.id}`} name={`frete-${order.id}`} className="mr-3" />
                          <label htmlFor={`sedex-${order.id}`} className="font-medium">Correios - SEDEX</label>
                          <p className="text-sm text-muted-foreground ml-6">Entrega em até 6 dias úteis</p>
                        </div>
                        <span className="font-bold">R$ 56,91</span>
                      </div>
                    </div>

                    <Button 
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3"
                      onClick={() => finalizarPedido(order.id)}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Finalizar Pedido
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Use a busca acima para encontrar pedidos em aberto
          </div>
        )}
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Histórico de Pedidos</h2>
        <Button onClick={() => setActiveView('dashboard')} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Buscar Histórico por Telefone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Telefone do cliente"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1"
            />
            <Button onClick={loadCustomerHistory} disabled={loadingHistory}>
              {loadingHistory ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {customerOrders.length > 0 && (
        <div className="space-y-4">
          {customerOrders.map((order) => (
            <Card key={order.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">Pedido #{order.id}</CardTitle>
                    <CardDescription>
                      {new Date(order.event_date).toLocaleDateString('pt-BR')} • {order.event_type}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">R$ {Number(order.total_amount).toFixed(2)}</div>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      Pago
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    {order.items.length} {order.items.length === 1 ? 'produto' : 'produtos'}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedHistoryOrder(order)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Produtos
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedHistoryOrder && (
        <Card className="mt-6 border-2 border-primary">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Produtos do Pedido #{selectedHistoryOrder.id}</CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedHistoryOrder(null)}
              >
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {selectedHistoryOrder.items.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    {item.image_url && (
                      <img 
                        src={item.image_url} 
                        alt={item.product_name}
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div>
                      <h4 className="font-medium">{item.product_name}</h4>
                      <p className="text-sm text-muted-foreground">Código: {item.product_code}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {item.qty}x R$ {Number(item.unit_price).toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total: R$ {(item.qty * Number(item.unit_price)).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
              <Separator />
              <div className="text-right">
                <div className="text-lg font-bold">
                  Total do Pedido: R$ {Number(selectedHistoryOrder.total_amount).toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (activeView === 'checkout') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          {renderCheckoutView()}
        </div>
      </div>
    );
  }

  if (activeView === 'history') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          {renderHistoryView()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center">
            <CreditCard className="h-10 w-10 mr-3 text-primary" />
            Centro de Controle - Checkout
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Finalize pedidos e processe pagamentos
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border-2 bg-blue-50 border-blue-200"
            onClick={() => setActiveView('checkout')}
          >
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <div className="p-3 rounded-lg bg-blue-50 mr-4">
                  <CreditCard className="h-8 w-8 text-blue-600" />
                </div>
                Finalizar Compra
              </CardTitle>
              <CardDescription className="text-base">
                Buscar pedidos e processar pagamentos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                Acessar
              </Button>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border-2 bg-purple-50 border-purple-200"
            onClick={() => setActiveView('history')}
          >
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <div className="p-3 rounded-lg bg-purple-50 mr-4">
                  <BarChart3 className="h-8 w-8 text-purple-600" />
                </div>
                Histórico de Pedidos
              </CardTitle>
              <CardDescription className="text-base">
                Ver pedidos finalizados do cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                Acessar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
