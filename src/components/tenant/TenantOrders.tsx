import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ShoppingCart, Eye, CreditCard, Calendar, Phone, Package } from 'lucide-react';
import { formatPhoneForDisplay } from '@/lib/phone-utils';

interface Order {
  id: number;
  tenant_id: string;
  cart_id?: number;
  customer_phone: string;
  event_date: string;
  event_type: string;
  total_amount: number;
  is_paid: boolean;
  payment_link?: string;
  observation?: string;
  whatsapp_group_name?: string;
  created_at: string;
}

interface OrderWithItems extends Order {
  cart_items?: {
    id: number;
    product_name: string;
    qty: number;
    unit_price: number;
  }[];
  frete_info?: {
    transportadora?: string;
    servico_escolhido?: string;
    valor_frete?: number;
    prazo?: number;
  };
  envio_info?: {
    status?: string;
    tracking_code?: string;
    label_url?: string;
    shipment_id?: string;
  };
}

export default function TenantOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const { profile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.tenant_id) {
      loadOrders();
    }
  }, [profile?.tenant_id]);

  const loadOrders = async () => {
    if (!profile?.tenant_id) return;

    try {
      const { data, error } = await supabaseTenant
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pedidos',
        variant: 'destructive'
      });
    }
  };

  const loadOrderDetails = async (order: Order) => {
    try {
      let orderWithItems: OrderWithItems = { ...order };

      if (order.cart_id) {
        const { data: cartItems, error } = await supabaseTenant
          .from('cart_items')
          .select(`
            id,
            qty,
            unit_price,
            products(name)
          `)
          .eq('cart_id', order.cart_id);

        if (error) throw error;

        orderWithItems.cart_items = cartItems?.map(item => ({
          id: item.id,
          product_name: (item.products as any)?.name || 'Produto não encontrado',
          qty: item.qty,
          unit_price: item.unit_price
        })) || [];
      }

      // Carregar informações de frete - removido (tabelas excluídas)
      // Carregar informações de envio - removido (tabelas excluídas)

      setSelectedOrder(orderWithItems);
      setIsViewDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar detalhes do pedido',
        variant: 'destructive'
      });
    }
  };

  const markAsPaid = async (orderId: number) => {
    try {
      const { error } = await supabaseTenant
        .from('orders')
        .update({ is_paid: true })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Pedido marcado como pago!'
      });

      loadOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, is_paid: true });
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao atualizar pedido',
        variant: 'destructive'
      });
    }
  };

  const formatPhone = (phone: string) => {
    return formatPhoneForDisplay(phone);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'paid') return order.is_paid;
    if (filter === 'pending') return !order.is_paid;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Pedidos
            </CardTitle>
            <CardDescription>
              Gerencie os pedidos da sua empresa
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              Todos
            </Button>
            <Button
              variant={filter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('pending')}
            >
              Pendentes
            </Button>
            <Button
              variant={filter === 'paid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('paid')}
            >
              Pagos
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum pedido encontrado</h3>
              <p className="text-muted-foreground">
                {filter === 'all' 
                  ? 'Ainda não há pedidos cadastrados.' 
                  : `Não há pedidos ${filter === 'paid' ? 'pagos' : 'pendentes'}.`
                }
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="font-semibold">Pedido #{order.id}</h4>
                      <Badge variant={order.is_paid ? 'default' : 'secondary'}>
                        {order.is_paid ? 'Pago' : 'Pendente'}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Phone className="h-3 w-3" />
                        <span>{formatPhone(order.customer_phone)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(order.event_date)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Package className="h-3 w-3" />
                        <span>{order.event_type}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="font-semibold">
                      R$ {order.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(order.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadOrderDetails(order)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {!order.is_paid && (
                      <Button
                        size="sm"
                        onClick={() => markAsPaid(order.id)}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Marcar como Pago
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Detalhes do Pedido #{selectedOrder?.id}
              </DialogTitle>
              <DialogDescription>
                Informações completas do pedido
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Informações do Cliente</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center space-x-2">
                        <Phone className="h-3 w-3" />
                        <span>{formatPhone(selectedOrder.customer_phone)}</span>
                      </div>
                      {selectedOrder.whatsapp_group_name && (
                        <div>
                          <strong>Grupo WhatsApp:</strong> {selectedOrder.whatsapp_group_name}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Informações do Evento</h4>
                    <div className="space-y-1 text-sm">
                      <div><strong>Data:</strong> {formatDate(selectedOrder.event_date)}</div>
                      <div><strong>Tipo:</strong> {selectedOrder.event_type}</div>
                      <div className="flex items-center space-x-2">
                        <strong>Status:</strong>
                        <Badge variant={selectedOrder.is_paid ? 'default' : 'secondary'}>
                          {selectedOrder.is_paid ? 'Pago' : 'Pendente'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedOrder.cart_items && selectedOrder.cart_items.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Itens do Pedido</h4>
                    <div className="space-y-2">
                      {selectedOrder.cart_items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div>
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-sm text-muted-foreground">
                              Quantidade: {item.qty}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">
                              R$ {(item.qty * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} cada
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Informações de Frete e Envio */}
                {(selectedOrder.frete_info || selectedOrder.envio_info) && (
                  <div>
                    <h4 className="font-semibold mb-2">Informações de Frete e Envio</h4>
                    <div className="space-y-3">
                      {selectedOrder.frete_info && (
                        <div className="p-3 bg-muted rounded-lg">
                          <h5 className="font-medium mb-2">Dados de Frete</h5>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {selectedOrder.frete_info.servico_escolhido && (
                              <div><strong>Serviço:</strong> {selectedOrder.frete_info.servico_escolhido}</div>
                            )}
                            {selectedOrder.frete_info.transportadora && (
                              <div><strong>Transportadora:</strong> {selectedOrder.frete_info.transportadora}</div>
                            )}
                            {selectedOrder.frete_info.valor_frete && (
                              <div><strong>Valor:</strong> R$ {Number(selectedOrder.frete_info.valor_frete).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            )}
                            {selectedOrder.frete_info.prazo && (
                              <div><strong>Prazo:</strong> {selectedOrder.frete_info.prazo} dias úteis</div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {selectedOrder.envio_info && (
                        <div className="p-3 bg-muted rounded-lg">
                          <h5 className="font-medium mb-2">Status do Envio</h5>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><strong>Status:</strong> <Badge variant={selectedOrder.envio_info.status === 'created' ? 'default' : 'secondary'}>{selectedOrder.envio_info.status || 'Pendente'}</Badge></div>
                            {selectedOrder.envio_info.tracking_code && (
                              <div><strong>Código de Rastreio:</strong> {selectedOrder.envio_info.tracking_code}</div>
                            )}
                            {selectedOrder.envio_info.shipment_id && (
                              <div><strong>ID do Envio:</strong> {selectedOrder.envio_info.shipment_id}</div>
                            )}
                            {selectedOrder.envio_info.label_url && (
                              <div className="col-span-2">
                                <a href={selectedOrder.envio_info.label_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  <strong>Baixar Etiqueta</strong>
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between text-lg font-semibold">
                    <span>Total do Pedido:</span>
                    <span>R$ {selectedOrder.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {selectedOrder.observation && (
                  <div>
                    <h4 className="font-semibold mb-2">Observações</h4>
                    <p className="text-sm p-3 bg-muted rounded-lg">{selectedOrder.observation}</p>
                  </div>
                )}

                {!selectedOrder.is_paid && (
                  <div className="flex justify-end">
                    <Button onClick={() => markAsPaid(selectedOrder.id)}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Marcar como Pago
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}