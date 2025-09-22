import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Printer, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Order {
  id: number;
  unique_order_id: string;
  customer_name: string;
  customer_phone: string;
  customer_cep: string;
  customer_street: string;
  customer_number: string;
  customer_complement: string;
  customer_city: string;
  customer_state: string;
  total_amount: number;
  created_at: string;
  event_type: string;
  event_date: string;
  items?: any[];
}

const Etiquetas = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingOrders, setProcessingOrders] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadPaidOrders();
  }, []);

  const loadPaidOrders = async () => {
    console.log('🔄 Carregando pedidos pagos...');
    try {
      const { data, error } = await supabaseTenant
        .from('orders')
        .select('*')
        .eq('is_paid', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erro na query de pedidos:', error);
        throw error;
      }

      console.log('✅ Pedidos carregados:', data?.length || 0);
      
      // Carregar itens dos pedidos separadamente
      const ordersWithItems = [];
      for (const order of data || []) {
        if (order.cart_id) {
          const { data: cartItems, error: itemsError } = await supabaseTenant
            .from('cart_items')
            .select(`
              id,
              qty as quantity,
              unit_price,
              product:products(name, code)
            `)
            .eq('cart_id', order.cart_id);

          if (!itemsError) {
            ordersWithItems.push({
              ...order,
              items: cartItems || []
            });
          } else {
            console.error('❌ Erro ao carregar itens do carrinho:', itemsError);
            ordersWithItems.push({
              ...order,
              items: []
            });
          }
        } else {
          ordersWithItems.push({
            ...order,
            items: []
          });
        }
      }

      console.log('✅ Pedidos com itens carregados:', ordersWithItems.length);
      setOrders(ordersWithItems);
    } catch (error) {
      console.error('❌ Erro ao carregar pedidos:', error);
      toast.error('Erro ao carregar pedidos pagos');
    } finally {
      setLoading(false);
    }
  };

  const sendToMelhorEnvio = async (orderId: number) => {
    setProcessingOrders(prev => new Set(prev).add(orderId));
    
    try {
      console.log('🚀 Enviando pedido para Melhor Envio:', orderId);
      
      const { data, error } = await supabaseTenant.functions.invoke('melhor-envio-labels', {
        body: {
          action: 'create_shipment',
          order_id: orderId,
          tenant_id: supabaseTenant.getTenantId()
        }
      });

      console.log('📡 Resposta da edge function:', { data, error });

      if (error) {
        console.error('❌ Erro da edge function:', error);
        throw new Error(error.message || 'Erro na comunicação com Melhor Envio');
      }

      if (data?.success) {
        toast.success('Remessa criada no Melhor Envio com sucesso!');
        // Recarregar os pedidos para atualizar o status
        loadPaidOrders();
      } else {
        console.error('❌ Resposta de erro:', data);
        throw new Error(data?.error || 'Erro desconhecido ao criar remessa');
      }
    } catch (error) {
      console.error('❌ Erro ao enviar para Melhor Envio:', error);
      toast.error(`Erro ao enviar para Melhor Envio: ${error.message}`);
    } finally {
      setProcessingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const buyShipment = async (orderId: number) => {
    setProcessingOrders(prev => new Set(prev).add(orderId));
    
    try {
      const { data, error } = await supabaseTenant.functions.invoke('melhor-envio-labels', {
        body: {
          action: 'buy_shipment',
          order_id: orderId,
          tenant_id: supabaseTenant.getTenantId()
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Frete comprado no Melhor Envio!');
        loadPaidOrders();
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Erro ao comprar frete:', error);
      toast.error(`Erro ao comprar frete: ${error.message}`);
    } finally {
      setProcessingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const printLabel = async (orderId: number) => {
    setProcessingOrders(prev => new Set(prev).add(orderId));
    
    try {
      const { data, error } = await supabaseTenant.functions.invoke('melhor-envio-labels', {
        body: {
          action: 'get_label',
          order_id: orderId,
          tenant_id: supabaseTenant.getTenantId()
        }
      });

      if (error) throw error;

      if (data.success && data.data.url) {
        // Abrir a etiqueta em nova aba para impressão
        window.open(data.data.url, '_blank');
        toast.success('Etiqueta gerada com sucesso!');
      } else {
        throw new Error(data.error || 'Erro ao gerar etiqueta');
      }
    } catch (error) {
      console.error('Erro ao imprimir etiqueta:', error);
      toast.error(`Erro ao imprimir etiqueta: ${error.message}`);
    } finally {
      setProcessingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{2})(\d{5})(\d{4})$/);
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return phone;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Package className="h-8 w-8" />
          Etiquetas de Envio
        </h1>
        <p className="text-muted-foreground">
          Gerencie as etiquetas dos pedidos pagos no Melhor Envio
        </p>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Nenhum pedido pago encontrado</h3>
            <p className="text-muted-foreground">
              Os pedidos pagos aparecerão aqui para gerar etiquetas de envio.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      Pedido #{order.unique_order_id || order.id}
                    </CardTitle>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary">Pago</Badge>
                      <Badge variant="outline">{order.event_type}</Badge>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div>Data: {formatDate(order.created_at)}</div>
                    <div>Evento: {formatDate(order.event_date)}</div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Dados do Cliente</h4>
                    <div className="text-sm space-y-1">
                      <div><strong>Nome:</strong> {order.customer_name}</div>
                      <div><strong>Telefone:</strong> {formatPhone(order.customer_phone)}</div>
                      <div><strong>Total:</strong> R$ {Number(order.total_amount).toFixed(2)}</div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Endereço de Entrega</h4>
                    <div className="text-sm space-y-1">
                      <div>{order.customer_street}, {order.customer_number}</div>
                      {order.customer_complement && <div>{order.customer_complement}</div>}
                      <div>{order.customer_city} - {order.customer_state}</div>
                      <div>CEP: {order.customer_cep}</div>
                    </div>
                  </div>
                </div>

                {order.items && order.items.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Itens do Pedido</h4>
                    <div className="space-y-1">
                       {order.items.map((item, index) => (
                         <div key={index} className="text-sm flex justify-between">
                           <span>{item.product?.name || 'Produto'} ({item.product?.code || 'N/A'})</span>
                           <span>{item.quantity}x R$ {Number(item.unit_price).toFixed(2)}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => sendToMelhorEnvio(order.id)}
                    disabled={processingOrders.has(order.id)}
                    className="flex-1"
                  >
                    {processingOrders.has(order.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Criar Remessa
                  </Button>
                  
                  <Button
                    onClick={() => buyShipment(order.id)}
                    disabled={processingOrders.has(order.id)}
                    variant="outline"
                  >
                    {processingOrders.has(order.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Package className="h-4 w-4 mr-2" />
                    )}
                    Comprar Frete
                  </Button>
                  
                  <Button
                    onClick={() => printLabel(order.id)}
                    disabled={processingOrders.has(order.id)}
                    variant="secondary"
                  >
                    {processingOrders.has(order.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Printer className="h-4 w-4 mr-2" />
                    )}
                    Imprimir Etiqueta
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Etiquetas;