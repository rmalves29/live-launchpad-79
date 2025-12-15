import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Printer, Send, Loader2, Truck, MapPin, User, Phone, Copy, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

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
  melhor_envio_shipment_id?: string;
  melhor_envio_tracking_code?: string;
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
              qty,
              unit_price,
              product:products(name, code, image_url)
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
    console.log('🚀 [ETIQUETAS] Iniciando envio para Melhor Envio:', { orderId, timestamp: new Date().toISOString() });
    
    setProcessingOrders(prev => new Set(prev).add(orderId));
    
    try {
      const requestPayload = {
        action: 'create_shipment',
        order_id: orderId,
        tenant_id: supabaseTenant.getTenantId()
      };

      console.log('📦 [ETIQUETAS] Payload da requisição:', requestPayload);
      
      const { data, error } = await supabaseTenant.functions.invoke('melhor-envio-labels', {
        body: requestPayload
      });

      console.log('📡 [ETIQUETAS] Resposta completa:', { 
        data, 
        error,
        hasData: !!data,
        hasError: !!error,
        dataKeys: data ? Object.keys(data) : [],
        errorKeys: error ? Object.keys(error) : []
      });

      if (error) {
        console.error('❌ [ETIQUETAS] Erro da edge function:', error);
        throw new Error(error.message || `Erro na comunicação: ${JSON.stringify(error)}`);
      }

      if (!data) {
        throw new Error('Nenhuma resposta recebida da API');
      }

      if (data.success === false) {
        console.error('❌ [ETIQUETAS] Erro na resposta:', data);
        throw new Error(data.error || 'Erro desconhecido na operação');
      }

      if (data.success === true) {
        console.log('✅ [ETIQUETAS] Remessa criada com sucesso:', data);
        toast.success('Remessa criada no Melhor Envio com sucesso!');
        loadPaidOrders();
      } else {
        if (data.shipment) {
          console.log('✅ [ETIQUETAS] Remessa criada (sem flag success):', data);
          toast.success('Remessa criada no Melhor Envio com sucesso!');
          loadPaidOrders();
        } else {
          throw new Error(data.error || 'Resposta inesperada da API');
        }
      }
      
    } catch (error: any) {
      console.error('❌ [ETIQUETAS] Erro crítico:', {
        message: error.message,
        stack: error.stack,
        orderId: orderId,
        timestamp: new Date().toISOString()
      });
      
      let userMessage = 'Erro ao enviar para Melhor Envio';
      
      if (error.message) {
        if (error.message.includes('Dados da empresa incompletos')) {
          userMessage = `Erro: ${error.message}`;
        } else if (error.message.includes('Integração')) {
          userMessage = `Erro de integração: ${error.message}`;
        } else if (error.message.includes('token')) {
          userMessage = 'Erro de autorização: Refaça a configuração do Melhor Envio';
        } else {
          userMessage = `Erro: ${error.message}`;
        }
      }
      
      toast.error(userMessage);
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
        const trackingCode = data.tracking_code;
        if (trackingCode) {
          toast.success(`Frete comprado! Código de rastreio: ${trackingCode}`);
        } else {
          toast.success('Frete comprado no Melhor Envio!');
        }
        loadPaidOrders();
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error: any) {
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
        window.open(data.data.url, '_blank');
        toast.success('Etiqueta gerada com sucesso!');
      } else {
        throw new Error(data.error || 'Erro ao gerar etiqueta');
      }
    } catch (error: any) {
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

  const copyTrackingCode = (trackingCode: string) => {
    navigator.clipboard.writeText(trackingCode);
    toast.success('Código de rastreio copiado!');
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

  const getShipmentStatus = (order: Order) => {
    if (order.melhor_envio_tracking_code) {
      return { status: 'shipped', label: 'Enviado', variant: 'default' as const };
    }
    if (order.melhor_envio_shipment_id) {
      return { status: 'ready', label: 'Remessa Criada', variant: 'secondary' as const };
    }
    return { status: 'pending', label: 'Pendente', variant: 'outline' as const };
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
          {orders.map((order) => {
            const shipmentStatus = getShipmentStatus(order);
            
            return (
              <Card key={order.id} className="overflow-hidden">
                {/* Header com status */}
                <CardHeader className="bg-muted/30 pb-3">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">
                          Pedido #{order.unique_order_id || order.id}
                        </CardTitle>
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Pago
                        </Badge>
                        <Badge variant={shipmentStatus.variant}>
                          <Truck className="h-3 w-3 mr-1" />
                          {shipmentStatus.label}
                        </Badge>
                      </div>
                      
                      {/* Código de rastreio em destaque */}
                      {order.melhor_envio_tracking_code && (
                        <div className="flex items-center gap-2 bg-primary/10 px-3 py-2 rounded-lg w-fit">
                          <Truck className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Rastreio:</span>
                          <code className="bg-background px-2 py-0.5 rounded text-sm font-mono">
                            {order.melhor_envio_tracking_code}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => copyTrackingCode(order.melhor_envio_tracking_code!)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Criado: {formatDate(order.created_at)}</div>
                      <div>Evento: {formatDate(order.event_date)}</div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-4 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Dados do Cliente */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <User className="h-4 w-4" />
                        Dados do Cliente
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                        <div className="font-medium">{order.customer_name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {formatPhone(order.customer_phone)}
                        </div>
                        <div className="text-sm font-semibold text-primary">
                          {formatCurrency(order.total_amount)}
                        </div>
                      </div>
                    </div>
                    
                    {/* Endereço */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        Endereço de Entrega
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1 text-sm">
                        <div>{order.customer_street}, {order.customer_number}</div>
                        {order.customer_complement && (
                          <div className="text-muted-foreground">{order.customer_complement}</div>
                        )}
                        <div>{order.customer_city} - {order.customer_state}</div>
                        <div className="font-mono text-xs">CEP: {order.customer_cep}</div>
                      </div>
                    </div>
                  </div>

                  {/* Itens do Pedido */}
                  {order.items && order.items.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Package className="h-4 w-4" />
                        Itens ({order.items.length})
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3">
                        <div className="grid gap-2">
                          {order.items.map((item, index) => (
                            <div 
                              key={index} 
                              className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0"
                            >
                              <div className="flex items-center gap-2">
                                {item.product?.image_url && (
                                  <img 
                                    src={item.product.image_url} 
                                    alt={item.product?.name}
                                    className="w-8 h-8 rounded object-cover"
                                  />
                                )}
                                <span>{item.product?.name || 'Produto'}</span>
                                <Badge variant="outline" className="text-xs">
                                  {item.product?.code || 'N/A'}
                                </Badge>
                              </div>
                              <span className="font-medium">
                                {item.qty}x {formatCurrency(item.unit_price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Botões de Ação */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button
                      onClick={() => sendToMelhorEnvio(order.id)}
                      disabled={processingOrders.has(order.id) || !!order.melhor_envio_shipment_id}
                      variant={order.melhor_envio_shipment_id ? "outline" : "default"}
                      size="sm"
                    >
                      {processingOrders.has(order.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : order.melhor_envio_shipment_id ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      {order.melhor_envio_shipment_id ? 'Remessa Criada' : 'Criar Remessa'}
                    </Button>
                    
                    <Button
                      onClick={() => buyShipment(order.id)}
                      disabled={processingOrders.has(order.id) || !order.melhor_envio_shipment_id || !!order.melhor_envio_tracking_code}
                      variant={order.melhor_envio_tracking_code ? "outline" : "secondary"}
                      size="sm"
                    >
                      {processingOrders.has(order.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : order.melhor_envio_tracking_code ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                      ) : (
                        <Package className="h-4 w-4 mr-2" />
                      )}
                      {order.melhor_envio_tracking_code ? 'Frete Comprado' : 'Comprar Frete'}
                    </Button>
                    
                    <Button
                      onClick={() => printLabel(order.id)}
                      disabled={processingOrders.has(order.id) || !order.melhor_envio_shipment_id}
                      variant="outline"
                      size="sm"
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
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Etiquetas;