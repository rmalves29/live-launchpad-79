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

      const { data, error } = await query;

      if (error) throw error;
      setOrders(data || []);
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
          action: 'sendPaidNotification',
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
    const reportContent = ordersToExport.map(order => `
      <div style="page-break-after: always; padding: 20px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2>Pedido #${order.id} - LOJA VIRTUAL</h2>
          <p>${format(new Date(order.created_at), 'dd \'de\' MMMM \'de\' yyyy \'às\' HH:mm:ss', { locale: ptBR })}</p>
        </div>
        
        <div style="margin-bottom: 20px;">
          <h3>Endereço de entrega</h3>
          <p>Aos cuidados: Cliente</p>
          <p>Telefone: ${order.customer_phone}</p>
          <p>Tipo de Evento: ${order.event_type}</p>
          <p>Data do Evento: ${format(new Date(order.event_date), 'dd/MM/yyyy')}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Produto</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Qtd.</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">Produtos do pedido</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">-</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">R$ ${order.total_amount.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 20px;">
          <p><strong>Total do pedido: R$ ${order.total_amount.toFixed(2)}</strong></p>
          <p>Status: ${order.is_paid ? 'Pago' : 'Pendente'}</p>
          ${order.observation ? `<p>Observação: ${order.observation}</p>` : ''}
        </div>
      </div>
    `).join('');

    const printWindow = window.open('', '_blank');
    if (printWindow) {
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
      printWindow.print();
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