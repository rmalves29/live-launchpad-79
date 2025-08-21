import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, CalendarIcon, Eye, Filter, Download, Printer, Check, FileText, Save } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Navbar from '@/components/Navbar';

interface Order {
  id: number;
  customer_phone: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
  payment_link?: string;
  created_at: string;
  cart_id?: number;
  printed?: boolean;
  observation?: string;
  customer?: {
    name?: string;
    cpf?: string;
    street?: string;
    number?: string;
    complement?: string;
    city?: string;
    state?: string;
    cep?: string;
  };
  cart_items?: {
    id: number;
    qty: number;
    unit_price: number;
    product: {
      name: string;
      code: string;
      image_url?: string;
    };
  }[];
}

const Pedidos = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPaid, setFilterPaid] = useState<boolean | null>(null);
  const [filterEventType, setFilterEventType] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<Date | undefined>();
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [editingObservation, setEditingObservation] = useState<number | null>(null);
  const [observationText, setObservationText] = useState('');

  const loadOrders = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterPaid !== null) {
        query = query.eq('is_paid', filterPaid);
      }

      if (filterEventType && filterEventType !== 'all') {
        query = query.eq('event_type', filterEventType);
      }

      if (filterDate) {
        const dateStr = format(filterDate, 'yyyy-MM-dd');
        query = query.eq('event_date', dateStr);
      }

      const { data: orderData, error: orderError } = await query;

      if (orderError) throw orderError;

      // Fetch customer and cart items data for each order
      const ordersWithDetails = await Promise.all((orderData || []).map(async (order) => {
        // Fetch customer data
        const { data: customerData } = await supabase
          .from('customers')
          .select('name, cpf, street, number, complement, city, state, cep')
          .eq('phone', order.customer_phone)
          .single();

        // Fetch cart items with products
        const { data: cartItemsData } = await supabase
          .from('cart_items')
          .select(`
            id,
            qty,
            unit_price,
            product:products!cart_items_product_id_fkey (
              name,
              code,
              image_url
            )
          `)
          .eq('cart_id', order.cart_id || 0);

        return {
          ...order,
          customer: customerData || undefined,
          cart_items: cartItemsData || []
        };
      }));

      setOrders(ordersWithDetails);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [filterPaid, filterEventType, filterDate]);

  const togglePaidStatus = async (orderId: number, currentStatus: boolean) => {
    setProcessingIds(prev => new Set(prev).add(orderId));
    
    try {
      // Update payment status in database
      const { error } = await supabase
        .from('orders')
        .update({ is_paid: !currentStatus })
        .eq('id', orderId);

      if (error) throw error;
      
      // Update local state
      setOrders(prev => prev.map(order => 
        order.id === orderId 
          ? { ...order, is_paid: !currentStatus }
          : order
      ));

      // Se o pedido foi marcado como pago, enviar mensagem automática
      if (!currentStatus) {
        await sendPaidOrderMessage(orderId);
      }

      toast({
        title: 'Sucesso',
        description: `Pedido ${!currentStatus ? 'marcado como pago' : 'desmarcado como pago'}`
      });
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar status do pagamento',
        variant: 'destructive'
      });
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const sendPaidOrderMessage = async (orderId: number) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      await supabase.functions.invoke('whatsapp-connection', {
        body: {
          action: 'send_paid_notification',
          data: {
            phone: order.customer_phone,
            orderId: order.id,
            totalAmount: order.total_amount,
            customerName: order.customer_phone // Poderia ser melhorado com nome real
          }
        }
      });
    } catch (error) {
      console.error('Error sending paid order message:', error);
    }
  };

  const saveObservation = async (orderId: number) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ observation: observationText })
        .eq('id', orderId);

      if (error) throw error;

      setOrders(prev => prev.map(order => 
        order.id === orderId 
          ? { ...order, observation: observationText }
          : order
      ));

      setEditingObservation(null);
      setObservationText('');

      toast({
        title: 'Sucesso',
        description: 'Observação salva com sucesso'
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao salvar observação',
        variant: 'destructive'
      });
    }
  };

  const toggleOrderSelection = (orderId: number) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const markOrdersAsPrinted = async () => {
    if (selectedOrders.size === 0) {
      toast({
        title: 'Aviso',
        description: 'Selecione pelo menos um pedido para marcar como impresso',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .update({ printed: true })
        .in('id', Array.from(selectedOrders));

      if (error) throw error;

      setOrders(prev => prev.map(order => 
        selectedOrders.has(order.id) 
          ? { ...order, printed: true }
          : order
      ));

      setSelectedOrders(new Set());

      toast({
        title: 'Sucesso',
        description: `${selectedOrders.size} pedido(s) marcado(s) como impresso(s)`
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao marcar pedidos como impressos',
        variant: 'destructive'
      });
    }
  };

  const exportSelectedOrders = () => {
    if (selectedOrders.size === 0) {
      toast({
        title: 'Aviso',
        description: 'Selecione pelo menos um pedido para exportar',
        variant: 'destructive'
      });
      return;
    }

    const selectedOrdersData = orders.filter(order => selectedOrders.has(order.id));
    generateOrderReport(selectedOrdersData);
  };

  const generateOrderReport = (ordersToExport: Order[]) => {
    const reportContent = ordersToExport.map(order => {
      const customerName = order.customer?.name || 'Cliente';
      const customerCPF = order.customer?.cpf || 'Não informado';
      const customerAddress = order.customer ? 
        `${order.customer.street || 'Endereço'}, ${order.customer.number || 'S/N'}${order.customer.complement ? `, ${order.customer.complement}` : ''}, ${order.customer.city || 'Cidade'} - ${order.customer.state || 'Estado'}, CEP: ${order.customer.cep || 'Não informado'}` 
        : 'Endereço não cadastrado';

      const cartItemsRows = order.cart_items && order.cart_items.length > 0 
        ? order.cart_items.map(item => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; vertical-align: top;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  ${item.product.image_url ? 
                    `<img src="${item.product.image_url}" alt="${item.product.name}" style="width: 60px; height: 60px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px;" />` :
                    `<div style="width: 60px; height: 60px; border: 1px solid #ddd; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center; font-size: 12px; border-radius: 4px;">Sem foto</div>`
                  }
                  <div>
                    <div style="font-weight: bold; margin-bottom: 4px;">${item.product.name}</div>
                    <div style="font-size: 12px; color: #666;">Código: ${item.product.code}</div>
                  </div>
                </div>
              </td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: center; vertical-align: top;">
                R$ ${item.unit_price.toFixed(2)}
              </td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: center; vertical-align: top;">
                ${item.qty}
              </td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right; vertical-align: top;">
                R$ ${(item.qty * item.unit_price).toFixed(2)}
              </td>
            </tr>
          `).join('')
        : `<tr>
             <td style="border: 1px solid #ddd; padding: 8px;" colspan="4">
               <div style="text-align: center; color: #666;">Produtos do pedido - detalhes não disponíveis</div>
             </td>
           </tr>`;

      return `
        <div style="page-break-after: always; padding: 20px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <!-- Header -->
          <div style="border-bottom: 2px solid #ddd; padding-bottom: 20px; margin-bottom: 20px;">
            <h1 style="margin: 0 0 10px 0; font-size: 24px; font-weight: bold;">${customerName}</h1>
            <div style="display: flex; gap: 20px; margin-bottom: 10px;">
              <span><strong>CPF:</strong> ${customerCPF}</span>
              <span><strong>Celular:</strong> ${order.customer_phone}</span>
            </div>
          </div>

          <!-- Two Column Layout -->
          <div style="display: flex; gap: 30px; margin-bottom: 30px;">
            <!-- Left Column - Order Summary -->
            <div style="flex: 2;">
              <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
                Resumo do pedido (${order.cart_items?.length || 0})
              </h3>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                <thead>
                  <tr style="background-color: #f8f9fa;">
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Produto</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: center; width: 80px;">Unitário</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: center; width: 50px;">Qtd</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: center; width: 80px;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${cartItemsRows}
                </tbody>
              </table>
            </div>

            <!-- Right Column - Shipping Info -->
            <div style="flex: 1;">
              <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold;">Informações do envio</h3>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 14px; line-height: 1.5;">
                  <div style="margin-bottom: 8px;">${customerAddress}</div>
                </div>
              </div>

              <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">Dados do envio</h4>
                <div style="font-size: 14px; line-height: 1.6;">
                  <div><strong>PAC</strong></div>
                  <div>R$ 23,00 - até 9 dias úteis</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Payment Information -->
          <div style="border-top: 1px solid #ddd; padding-top: 20px;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold;">Forma de pagamento (1)</h3>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px;">
              <div style="font-size: 14px; line-height: 1.6;">
                <div style="margin-bottom: 8px;"><strong>Pix - mercado pago</strong></div>
                <div style="margin-bottom: 4px;">R$ ${order.total_amount.toFixed(2)} - Data do pagamento: ${format(new Date(order.created_at), 'dd/MM/yy')}</div>
                ${order.observation ? `
                  <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd;">
                    <div style="font-weight: bold; margin-bottom: 4px;">Observações do pagamento</div>
                    <div>${order.observation}</div>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 15px;">
            <div><strong>Total do pedido: R$ ${order.total_amount.toFixed(2)}</strong></div>
            <div style="margin-top: 5px;">Status: ${order.is_paid ? 'Pago' : 'Pendente'}</div>
            <div style="margin-top: 5px;">Pedido #${order.id} - ${format(new Date(order.created_at), 'dd/MM/yyyy \'às\' HH:mm')}</div>
          </div>
        </div>
      `;
    }).join('');

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Pedidos Selecionados</title>
            <style>
              @page { margin: 1cm; }
              body { margin: 0; }
            </style>
          </head>
          <body>
            ${reportContent}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      // Aguarda o conteúdo carregar antes de imprimir
      printWindow.onload = () => {
        try {
          printWindow.focus();
          printWindow.print();
        } finally {
          setTimeout(() => {
            printWindow.close();
          }, 300);
        }
      };
    } else {
      toast({
        title: 'Aviso',
        description: 'O navegador bloqueou a janela de impressão. Permita pop-ups para este site.',
        variant: 'destructive'
      });
    }
  };

  const exportToCSV = () => {
    const headers = ['Pedido', 'Telefone', 'Total', 'Pago', 'Tipo Evento', 'Data Evento', 'Criado em'];
    const csvContent = [
      headers.join(','),
      ...orders.map(order => [
        order.id,
        order.customer_phone,
        order.total_amount,
        order.is_paid ? 'Sim' : 'Não',
        order.event_type,
        order.event_date,
        format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `pedidos_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Sucesso',
      description: 'Arquivo CSV exportado com sucesso'
    });
  };

  const clearFilters = () => {
    setFilterPaid(null);
    setFilterEventType('all');
    setFilterDate(undefined);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="p-6">
        <div className="container mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Gestão de Pedidos</h1>
            <div className="flex gap-2">
              <Button 
                onClick={exportSelectedOrders} 
                variant="outline"
                disabled={selectedOrders.size === 0}
              >
                <FileText className="h-4 w-4 mr-2" />
                Imprimir Selecionados ({selectedOrders.size})
              </Button>
              <Button 
                onClick={markOrdersAsPrinted} 
                variant="outline"
                disabled={selectedOrders.size === 0}
              >
                <Printer className="h-4 w-4 mr-2" />
                Marcar como Impresso
              </Button>
              <Button onClick={exportToCSV} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status Pagamento</label>
              <Select 
                value={filterPaid === null ? 'all' : filterPaid.toString()} 
                onValueChange={(value) => setFilterPaid(value === 'all' ? null : value === 'true')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Pagos</SelectItem>
                  <SelectItem value="false">Não pagos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo do Evento</label>
              <Select value={filterEventType} onValueChange={setFilterEventType}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="BAZAR">BAZAR</SelectItem>
                  <SelectItem value="LIVE">LIVE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Data do Evento</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !filterDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filterDate ? format(filterDate, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDate}
                    onSelect={setFilterDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium invisible">Ações</label>
              <Button onClick={clearFilters} variant="outline" className="w-full">
                Limpar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input 
                      type="checkbox" 
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOrders(new Set(orders.map(o => o.id)));
                        } else {
                          setSelectedOrders(new Set());
                        }
                      }}
                      checked={selectedOrders.size === orders.length && orders.length > 0}
                    />
                  </TableHead>
                  <TableHead>#Pedido</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pago?</TableHead>
                  <TableHead>Impresso?</TableHead>
                  <TableHead>Tipo Evento</TableHead>
                  <TableHead>Data Evento</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhum pedido encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <input 
                          type="checkbox"
                          checked={selectedOrders.has(order.id)}
                          onChange={() => toggleOrderSelection(order.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">#{order.id}</Badge>
                      </TableCell>
                      <TableCell>{order.customer_phone}</TableCell>
                      <TableCell>R$ {order.total_amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={order.is_paid}
                            onCheckedChange={() => togglePaidStatus(order.id, order.is_paid)}
                            disabled={processingIds.has(order.id)}
                          />
                          <Badge variant={order.is_paid ? 'default' : 'secondary'}>
                            {order.is_paid ? 'Pago' : 'Pendente'}
                          </Badge>
                          {processingIds.has(order.id) && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          {order.printed ? (
                            <Badge variant="default" className="flex items-center">
                              <Check className="h-3 w-3 mr-1" />
                              Impresso
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Não impresso</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.event_type}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(order.event_date), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {editingObservation === order.id ? (
                            <div className="flex items-center space-x-2">
                              <Input
                                value={observationText}
                                onChange={(e) => setObservationText(e.target.value)}
                                placeholder="Adicionar observação"
                                className="w-32"
                              />
                              <Button 
                                size="sm" 
                                onClick={() => saveObservation(order.id)}
                              >
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setEditingObservation(null);
                                  setObservationText('');
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm max-w-32 truncate">
                                {order.observation || 'Sem observação'}
                              </span>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setEditingObservation(order.id);
                                  setObservationText(order.observation || '');
                                }}
                              >
                                <FileText className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {orders.length > 0 && (
            <div className="p-4 border-t bg-muted/30">
              <div className="text-sm text-muted-foreground">
                Total de pedidos: {orders.length} | 
                Pagos: {orders.filter(o => o.is_paid).length} | 
                Pendentes: {orders.filter(o => !o.is_paid).length} |
                Valor total: R$ {orders.reduce((sum, o) => sum + o.total_amount, 0).toFixed(2)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
};

export default Pedidos;