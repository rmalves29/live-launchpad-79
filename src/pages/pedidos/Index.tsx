import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, CalendarIcon, Eye, Filter, Download, Printer, Check, FileText, Save, Edit, Trash2, MessageCircle, Send, ArrowLeft, BarChart3, DollarSign, Clock, Package, Search, Truck } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, formatCurrency } from '@/lib/utils';
import { EditOrderDialog } from '@/components/EditOrderDialog';
import { ViewOrderDialog } from '@/components/ViewOrderDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { formatPhoneForDisplay, normalizeForStorage, normalizeForSending } from '@/lib/phone-utils';

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
    item_added_message_sent?: boolean;
    payment_confirmation_sent?: boolean;
    item_added_delivered?: boolean;
    payment_confirmation_delivered?: boolean;
    tenant_id: string;
    unique_order_id?: string;
    melhor_envio_tracking_code?: string;
    customer_name?: string;
    customer?: {
      name?: string;
      cpf?: string;
      street?: string;
      number?: string;
      complement?: string;
      city?: string;
      state?: string;
      cep?: string;
      instagram?: string;
    };
    cart_items?: {
      id: number;
      qty: number;
      unit_price: number;
      product: {
        name: string;
        code: string;
        image_url?: string;
        color?: string;
        size?: string;
      };
    }[];
  }

  const Pedidos = () => {
    const { toast } = useToast();
    const { confirm, ConfirmDialog } = useConfirmDialog();
    const { profile } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterPaid, setFilterPaid] = useState<boolean | null>(null);
    const [filterEventType, setFilterEventType] = useState<string>('all');
    const [filterDate, setFilterDate] = useState<Date | undefined>();
    const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
    const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
    const [editingObservation, setEditingObservation] = useState<number | null>(null);
    const [observationText, setObservationText] = useState('');
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [editOrderOpen, setEditOrderOpen] = useState(false);
    const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
    const [viewOrderOpen, setViewOrderOpen] = useState(false);
    const [activeView, setActiveView] = useState<'dashboard' | 'management'>('dashboard');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Estado para edição de rastreio
    const [editingTracking, setEditingTracking] = useState<number | null>(null);
    const [trackingText, setTrackingText] = useState('');
    const [savingTracking, setSavingTracking] = useState<number | null>(null);
    
    // Estado para diálogo de confirmação de pagamento
    const [paymentConfirmDialog, setPaymentConfirmDialog] = useState<{
      open: boolean;
      orderId: number | null;
    }>({ open: false, orderId: null });

    // Filtros específicos para Mensagem em Massa
    const [broadcastPaid, setBroadcastPaid] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [broadcastDateMode, setBroadcastDateMode] = useState<'all' | 'specific'>('all');
    const [broadcastDate, setBroadcastDate] = useState<Date | undefined>(undefined);

    const loadOrders = async () => {
      try {
        setLoading(true);
        let query = supabaseTenant
          .from('orders')
          .select('*, tenant_id')
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
          const { data: customerData } = await supabaseTenant
            .from('customers')
            .select('name, cpf, street, number, complement, neighborhood, city, state, cep, instagram')
            .eq('phone', order.customer_phone)
            .maybeSingle();

          // Fetch cart items with products. If cart_id is missing, try to infer the most recent cart for this cliente
          let cartItemsData: any[] = [];
          if (order.cart_id) {
            const { data } = await supabaseTenant
              .from('cart_items')
              .select(`
                id,
                qty,
                unit_price,
                product_name,
                product_code,
                product_image_url,
                product:products!cart_items_product_id_fkey (
                  name,
                  code,
                  image_url,
                  color,
                  size
                )
              `)
              .eq('cart_id', order.cart_id);
            cartItemsData = data || [];
          } else {
            // Fallback: buscar um carrinho recente do mesmo telefone (útil para pedidos antigos sem vínculo)
            const { data: candidateCarts } = await supabaseTenant
              .from('carts')
              .select('id, event_date, created_at')
              .eq('customer_phone', order.customer_phone)
              .order('created_at', { ascending: false })
              .limit(5);

            let resolvedCartId: number | null = null;
            if (candidateCarts && candidateCarts.length > 0) {
              // tentar casar por proximidade da data do evento (±2 dias)
              const oEvent = new Date(order.event_date);
              const byDate = candidateCarts.find((c: any) => {
                const cEvent = new Date(c.event_date);
                const diffDays = Math.abs((cEvent.getTime() - oEvent.getTime()) / (1000 * 60 * 60 * 24));
                return diffDays <= 2;
              });
              resolvedCartId = (byDate || candidateCarts[0])?.id ?? null;
            }

            if (resolvedCartId) {
              const { data } = await supabaseTenant
                .from('cart_items')
                .select(`
                  id,
                  qty,
                  unit_price,
                  product_name,
                  product_code,
                  product_image_url,
                  product:products!cart_items_product_id_fkey (
                    name,
                    code,
                    image_url,
                    color,
                    size
                  )
                `)
                .eq('cart_id', resolvedCartId);
              cartItemsData = data || [];
            }
          }

          return {
            ...order,
            customer: customerData || undefined,
            cart_items: cartItemsData
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
      // Se está DESMARCANDO como pago, apenas faz o update sem confirmação
      if (currentStatus) {
        setProcessingIds(prev => new Set(prev).add(orderId));
        
        try {
          const { error } = await supabaseTenant
            .from('orders')
            .update({ is_paid: false, payment_confirmation_sent: false })
            .eq('id', orderId);

          if (error) throw error;
          
          setOrders(prev => prev.map(order => 
            order.id === orderId 
              ? { ...order, is_paid: false, payment_confirmation_sent: false }
              : order
          ));

          toast({
            title: 'Sucesso',
            description: 'Pedido desmarcado como pago'
          });
        } catch (error) {
          toast({
            title: 'Erro',
            description: 'Erro ao atualizar status',
            variant: 'destructive'
          });
        } finally {
          setProcessingIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(orderId);
            return newSet;
          });
        }
        return;
      }

      // Se está MARCANDO como pago, abre diálogo de confirmação
      setPaymentConfirmDialog({ open: true, orderId });
    };

    // Confirmar marcação como pago
    const confirmMarkAsPaid = async () => {
      const orderId = paymentConfirmDialog.orderId;
      if (!orderId) return;
      
      setPaymentConfirmDialog({ open: false, orderId: null });
      setProcessingIds(prev => new Set(prev).add(orderId));
      
      try {
        const { error } = await supabaseTenant
          .from('orders')
          .update({ is_paid: true, skip_paid_message: false })
          .eq('id', orderId);

        if (error) throw error;
        
        setOrders(prev => prev.map(order => 
          order.id === orderId 
            ? { ...order, is_paid: true }
            : order
        ));

        toast({
          title: 'Sucesso',
          description: 'Pedido marcado como pago'
        });
      } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
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
        // Buscar order para pegar telefone e total
        const { data: orderData, error: orderError } = await supabaseTenant
          .from('orders')
          .select('id, customer_phone, total_amount, tenant_id')
          .eq('id', orderId)
          .maybeSingle();

        if (orderError || !orderData) {
          console.error('Erro ao buscar pedido para envio:', orderError);
          return false;
        }

        const payload = {
          tenant_id: orderData.tenant_id,
          order_id: orderData.id,
          customer_phone: orderData.customer_phone,
          total: Number(orderData.total_amount || 0)
        };

        // Invocar edge function que envia o template PAID_ORDER
        const res = await supabase.functions.invoke('zapi-send-paid-order', { body: payload });
        if (res.error) {
          console.error('Erro na edge function zapi-send-paid-order:', res.error);
          return false;
        }

        // Sucesso
        return true;
      } catch (error) {
        console.error('Erro ao enviar mensagem de pagamento:', error);
        return false;
      }
    };

    const saveObservation = async (orderId: number) => {
      try {
        const { error } = await supabaseTenant
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

    const saveTrackingCode = async (orderId: number) => {
      if (!trackingText.trim()) {
        toast({
          title: 'Aviso',
          description: 'Digite um código de rastreio',
          variant: 'destructive'
        });
        return;
      }

      setSavingTracking(orderId);
      
      try {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        // Salvar código de rastreio no banco
        const { error: updateError } = await supabaseTenant
          .from('orders')
          .update({ melhor_envio_tracking_code: trackingText.trim() })
          .eq('id', orderId);

        if (updateError) throw updateError;

        // Enviar WhatsApp com código de rastreio
        const { error: whatsappError } = await supabase.functions.invoke('zapi-send-tracking', {
          body: {
            order_id: orderId,
            tenant_id: order.tenant_id,
            tracking_code: trackingText.trim(),
            shipped_at: new Date().toISOString()
          }
        });

        if (whatsappError) {
          console.error('Erro ao enviar WhatsApp:', whatsappError);
          toast({
            title: 'Rastreio Salvo',
            description: 'Código salvo, mas houve erro ao enviar WhatsApp',
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Sucesso',
            description: 'Código de rastreio salvo e WhatsApp enviado ao cliente!'
          });
        }

        // Atualizar estado local
        setOrders(prev => prev.map(o => 
          o.id === orderId 
            ? { ...o, melhor_envio_tracking_code: trackingText.trim() }
            : o
        ));

        setEditingTracking(null);
        setTrackingText('');
      } catch (error) {
        console.error('Erro ao salvar rastreio:', error);
        toast({
          title: 'Erro',
          description: 'Erro ao salvar código de rastreio',
          variant: 'destructive'
        });
      } finally {
        setSavingTracking(null);
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
        const { error } = await supabaseTenant
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

    const togglePrintedStatus = async (orderId: number, currentStatus: boolean) => {
      try {
        const { error } = await supabaseTenant
          .from('orders')
          .update({ printed: !currentStatus })
          .eq('id', orderId);

        if (error) throw error;

        setOrders(prev => prev.map(order => 
          order.id === orderId 
            ? { ...order, printed: !currentStatus }
            : order
        ));

        toast({
          title: 'Sucesso',
          description: `Pedido ${!currentStatus ? 'marcado como impresso' : 'desmarcado como impresso'}`
        });
      } catch (error) {
        toast({
          title: 'Erro',
          description: 'Erro ao alterar status de impressão',
          variant: 'destructive'
        });
      }
    };

    const deleteSelectedOrders = async () => {
      if (selectedOrders.size === 0) {
        toast({
          title: 'Aviso',
          description: 'Selecione pelo menos um pedido para deletar',
          variant: 'destructive'
        });
        return;
      }

      const confirmed = await confirm({
        description: `Deseja deletar ${selectedOrders.size} pedido(s)?`,
        confirmText: 'Deletar',
        variant: 'destructive',
      });
      if (!confirmed) {
        return;
      }

      try {
        // Delete cart items first if they exist
        for (const orderId of selectedOrders) {
          const order = orders.find(o => o.id === orderId);
          if (order?.cart_id) {
            await supabaseTenant
              .from('cart_items')
              .delete()
              .eq('cart_id', order.cart_id);
            
            await supabaseTenant
              .from('carts')
              .delete()
              .eq('id', order.cart_id);
          }
        }

        // Delete orders
        const { error } = await supabaseTenant
          .from('orders')
          .delete()
          .in('id', Array.from(selectedOrders));

        if (error) throw error;

        // Update local state
        setOrders(prev => prev.filter(order => !selectedOrders.has(order.id)));
        setSelectedOrders(new Set());

        toast({
          title: 'Sucesso',
          description: `${selectedOrders.size} pedido(s) deletado(s) com sucesso`
        });
      } catch (error) {
        console.error('Error deleting orders:', error);
        toast({
          title: 'Erro',
          description: 'Erro ao deletar pedidos',
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
        const customerNeighborhood = order.customer?.neighborhood || '';
        
        // Build address with explicit bairro
        let customerAddress = 'Endereço não cadastrado';
        if (order.customer) {
          const parts = [];
          if (order.customer.street) parts.push(`${order.customer.street}, ${order.customer.number || 'S/N'}`);
          if (order.customer.complement) parts.push(order.customer.complement);
          if (customerNeighborhood) parts.push(customerNeighborhood);
          if (order.customer.city && order.customer.state) parts.push(`${order.customer.city} - ${order.customer.state}`);
          if (order.customer.cep) parts.push(`CEP: ${order.customer.cep}`);
          customerAddress = parts.join(', ');
        }

        const cartItemsRows = order.cart_items && order.cart_items.length > 0 
          ? order.cart_items.map(item => {
              const variations = [];
              if (item.product.color) variations.push(`Cor: ${item.product.color}`);
              if (item.product.size) variations.push(`Tam: ${item.product.size}`);
              const variationsHtml = variations.length > 0 
                ? `<div style="font-size: 9px; color: #888; margin-top: 2px;">${variations.join(' | ')}</div>` 
                : '';
              
              return `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px; vertical-align: middle;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${item.product.image_url ? 
                      `<img src="${item.product.image_url}" alt="${item.product.name}" style="width: 70px; height: 70px; object-fit: cover; border: 1px solid #ddd; border-radius: 6px; flex-shrink: 0;" />` :
                      `<div style="width: 70px; height: 70px; border: 1px solid #ddd; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center; font-size: 9px; border-radius: 6px; flex-shrink: 0; color: #999;">Sem foto</div>`
                    }
                    <div style="flex: 1;">
                      <div style="font-weight: 600; margin-bottom: 3px; font-size: 11px; color: #333;">${item.product.name}</div>
                      <div style="font-size: 10px; color: #666; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; display: inline-block;">Código: ${item.product.code}</div>
                      ${variationsHtml}
                    </div>
                  </div>
                </td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center; vertical-align: middle; font-size: 11px; font-weight: 500;">
                  R$ ${item.unit_price.toFixed(2)}
                </td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center; vertical-align: middle; font-size: 12px; font-weight: 600;">
                  ${item.qty}
                </td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; vertical-align: middle; font-size: 11px; font-weight: 600; color: #16a34a;">
                  R$ ${(item.qty * item.unit_price).toFixed(2)}
                </td>
              </tr>
            `;}).join('')
          : `<tr>
              <td style="border: 1px solid #ddd; padding: 10px; font-size: 11px;" colspan="4">
                <div style="text-align: center; color: #666;">Produtos do pedido - detalhes não disponíveis</div>
              </td>
            </tr>`;

        return `
          <div style="page-break-after: always; padding: 16px; font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 10px; padding: 14px; margin-bottom: 16px;">
              <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 10px;">
                <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #1a1a2e;">${customerName}</h1>
                <span style="background: #fff; padding: 3px 8px; border-radius: 5px; font-size: 11px;"><strong>CPF:</strong> ${customerCPF}</span>
                <span style="background: #fff; padding: 3px 8px; border-radius: 5px; font-size: 11px;"><strong>Celular:</strong> ${formatPhoneForDisplay(order.customer_phone)}</span>
              </div>
              
              <div style="margin-top: 10px; padding: 10px; background: #fff; border-radius: 8px; border-left: 4px solid #16a34a;">
                <strong style="display: block; margin-bottom: 8px; font-size: 11px; color: #374151;">📍 Endereço de entrega:</strong>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 11px; color: #4b5563;">
                  <div><strong>Rua:</strong> ${order.customer?.street || 'Não informado'}</div>
                  <div><strong>Número:</strong> ${order.customer?.number || 'S/N'}${order.customer?.complement ? ` - ${order.customer.complement}` : ''}</div>
                  <div><strong>Bairro:</strong> ${order.customer?.neighborhood || 'Não informado'}</div>
                  <div><strong>Cidade:</strong> ${order.customer?.city || 'Não informada'} - ${order.customer?.state || 'UF'}</div>
                  <div><strong>CEP:</strong> ${order.customer?.cep || 'Não informado'}</div>
                </div>
              </div>
              
              <!-- Shipping Information -->
              <div style="margin-top: 10px; padding: 10px; background: #fff; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <div style="font-size: 11px; line-height: 1.5;">
                  <strong style="display: block; margin-bottom: 4px; font-size: 11px; color: #374151;">🚚 Informações de envio:</strong>
                  <span style="color: #4b5563;">${order.event_type || 'Não especificado'} - ${format(new Date(order.event_date), 'dd/MM/yyyy')}</span>
                </div>
              </div>
            </div>

            <!-- Order Summary -->
            <div style="margin-bottom: 24px;">
              <h3 style="margin: 0 0 14px 0; font-size: 15px; font-weight: 600; color: #1a1a2e; display: flex; align-items: center; gap: 8px;">
                📦 Resumo do pedido <span style="background: #16a34a; color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 12px;">${order.cart_items?.length || 0} ${(order.cart_items?.length || 0) === 1 ? 'item' : 'itens'}</span>
              </h3>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <thead>
                  <tr style="background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); color: #fff;">
                    <th style="padding: 12px 10px; text-align: left; font-size: 12px; font-weight: 600;">Produto</th>
                    <th style="padding: 12px 10px; text-align: center; width: 80px; font-size: 12px; font-weight: 600;">Unitário</th>
                    <th style="padding: 12px 10px; text-align: center; width: 50px; font-size: 12px; font-weight: 600;">Qtd</th>
                    <th style="padding: 12px 10px; text-align: right; width: 80px; font-size: 12px; font-weight: 600;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${cartItemsRows}
                </tbody>
              </table>
            </div>

            <!-- Payment Information - Side by Side -->
            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #1a1a2e;">💳 Forma de pagamento</h3>
              <div style="background: #f0fdf4; padding: 14px; border-radius: 8px; border: 1px solid #86efac;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                  <div style="font-size: 13px; font-weight: 600; color: #166534;">Pix - Mercado Pago</div>
                  <div style="font-size: 16px; font-weight: 700; color: #16a34a;">R$ ${order.total_amount.toFixed(2)}</div>
                  <div style="color: #4b5563; font-size: 12px; display: flex; align-items: center; gap: 4px;">📅 ${format(new Date(order.created_at), 'dd/MM/yyyy')}</div>
                </div>
              </div>
            </div>

            <!-- Observations -->
            ${order.observation ? `
              <div style="margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #1a1a2e;">📝 Observações</h3>
                <div style="background: #fef3c7; padding: 14px; border-radius: 8px; border: 1px solid #fcd34d;">
                  <div style="font-size: 12px; line-height: 1.6; color: #92400e;">
                    ${order.observation}
                  </div>
                </div>
              </div>
            ` : ''}
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

    const sendBroadcastMessage = async () => {
      console.log('Iniciando envio de mensagem em massa...');
      try {
        setLoading(true);

        // Montar consulta independente para o envio em massa (status + data)
        let query = supabaseTenant
          .from('orders')
          .select('id, customer_phone, is_paid, event_date');

        if (broadcastPaid === 'paid') {
          query = query.eq('is_paid', true);
        } else if (broadcastPaid === 'unpaid') {
          query = query.eq('is_paid', false);
        }

        if (broadcastDateMode === 'specific') {
          if (!broadcastDate) {
            toast({
              title: 'Aviso',
              description: 'Selecione uma data para enviar as mensagens',
              variant: 'destructive'
            });
            setLoading(false);
            return;
          }
          const dateStr = format(broadcastDate, 'yyyy-MM-dd');
          query = query.eq('event_date', dateStr);
        }

        const { data: ordersToSend, error: ordersError } = await query;
        if (ordersError) throw ordersError;

        if (!ordersToSend || ordersToSend.length === 0) {
          toast({
            title: 'Aviso',
            description: 'Nenhum pedido encontrado com os filtros de mensagem',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        // Buscar tenant_id do contexto
        const currentTenantId = supabaseTenant.getTenantId();
        
        if (!currentTenantId) {
          throw new Error('Tenant ID não encontrado. Certifique-se de estar logado.');
        }

        console.log('Buscando template de mensagem em massa para tenant:', currentTenantId);

        // Buscar template de "Mensagem em Massa" usando supabase client normal com filtro explícito de tenant
        const { data: template, error: templateError } = await supabase
          .from('whatsapp_templates')
          .select('content')
          .eq('type', 'MSG_MASSA')
          .eq('tenant_id', currentTenantId)
          .maybeSingle();

        console.log('Template encontrado:', template);
        console.log('Erro na busca:', templateError);

        if (templateError || !template) {
          // Listar todos os templates deste tenant para debug
          const { data: allTemplates } = await supabase
            .from('whatsapp_templates')
            .select('id, title, type, tenant_id')
            .eq('tenant_id', currentTenantId);
          
          console.error('Templates disponíveis para este tenant:', allTemplates);
          throw new Error(`Template de Mensagem em Massa (MSG_MASSA) não encontrado para seu tenant. Templates disponíveis: ${allTemplates?.map(t => `ID: ${t.id} - ${t.title || 'Sem título'} (${t.type})`).join(', ') || 'nenhum'}`);
        }

        const uniquePhones = Array.from(new Set((ordersToSend || []).map(o => o.customer_phone).filter(Boolean))) as string[];

        if (uniquePhones.length === 0) {
          toast({
            title: 'Aviso',
            description: 'Nenhum telefone encontrado para envio',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        const confirmed = await confirm({
          description: `Deseja enviar mensagem em massa para ${uniquePhones.length} cliente(s)?`,
          confirmText: 'Enviar',
        });
        if (!confirmed) {
          setLoading(false);
          return;
        }

        // Preparar mensagens personalizadas
        const messages = uniquePhones.map(phone => {
          const customerName = orders.find(o => o.customer_phone === phone)?.customer?.name || 'Cliente';
          return template.content.replace('{{nome_cliente}}', customerName);
        });

        // WhatsApp functionality removed - only log to database
        
        // Registrar no banco
        for (let i = 0; i < uniquePhones.length; i++) {
          const phone = uniquePhones[i];
          const message = messages[i % messages.length];
          
          await supabase.from('whatsapp_messages').insert({
            phone,
            message,
            type: 'broadcast',
            sent_at: new Date().toISOString(),
            tenant_id: profile?.tenant_id
          });
        }

        toast({
          title: 'Funcionalidade Removida',
          description: 'O envio de WhatsApp foi removido do sistema.',
          variant: 'destructive'
        });

      } catch (error) {
        console.error('Error sending broadcast message:', error);
        toast({
          title: 'Erro',
          description: error.message || 'Erro ao enviar mensagem em massa',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
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
      setSearchTerm('');
    };

    // Filtrar pedidos por telefone
    const filteredOrders = orders.filter(order => {
      if (!searchTerm) return true;
      
      // Normalizar o termo de busca e o telefone do pedido
      const normalizedSearch = normalizeForStorage(searchTerm);
      const normalizedPhone = normalizeForStorage(order.customer_phone);
      
      // Buscar também sem normalização (para busca parcial)
      return normalizedPhone.includes(normalizedSearch) || 
            order.customer_phone.includes(searchTerm) ||
            formatPhoneForDisplay(order.customer_phone).includes(searchTerm);
    });

    // Estatísticas baseadas nos pedidos filtrados (para mostrar resumo do dia ou conforme filtros aplicados)
    const totalOrdersCount = filteredOrders.length;
    const paidOrdersCount = filteredOrders.filter(o => o.is_paid).length;
    const unpaidOrdersCount = totalOrdersCount - paidOrdersCount;
    const totalSalesValue = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const totalPaidValue = filteredOrders.filter(o => o.is_paid).reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const percentPaid = totalOrdersCount > 0 ? (paidOrdersCount / totalOrdersCount) * 100 : 0;
    const ticketMedio = totalOrdersCount > 0 ? (totalSalesValue / totalOrdersCount) : 0;

    const formatCurrencyLocal = (value: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    return (
      <div className="min-h-screen bg-background">
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
                <Button 
                  onClick={deleteSelectedOrders} 
                  variant="destructive"
                  disabled={selectedOrders.size === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Deletar Selecionados ({selectedOrders.size})
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
            <div className="space-y-4">
              {/* Campo de busca por telefone */}
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>

              <Separator />

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
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            {/* Resumo rápido (reflete os filtros aplicados) */}
            <div className="p-4 border-b bg-muted/50">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Total de vendas</div>
                  <div className="text-lg font-semibold">{formatCurrencyLocal(totalSalesValue)}</div>
                  <div className="text-xs text-muted-foreground">({totalOrdersCount} pedidos)</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Pago</div>
                  <div className="text-lg font-semibold text-emerald-600">{formatCurrencyLocal(totalPaidValue)}</div>
                  <div className="text-xs text-muted-foreground">Pagos: <span className="text-emerald-700 font-medium">{paidOrdersCount}</span>  |  Não pagos: <span className="text-red-600 font-medium">{unpaidOrdersCount}</span></div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">% Pedidos Pagos</div>
                  <div className="text-lg font-semibold">{percentPaid.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">Ticket médio: {formatCurrencyLocal(ticketMedio)}</div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 px-2">
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
                    <TableHead className="px-2 whitespace-nowrap">#Pedido</TableHead>
                    <TableHead className="px-2">Telefone</TableHead>
                    <TableHead className="px-2">@ Live</TableHead>
                    <TableHead className="px-2">Total</TableHead>
                    <TableHead className="px-2">Pago?</TableHead>
                    <TableHead className="px-2">Impresso?</TableHead>
                    <TableHead className="px-2 whitespace-nowrap">Tipo Evento</TableHead>
                    <TableHead className="px-2 whitespace-nowrap">Data Evento</TableHead>
                    <TableHead className="px-2">Rastreio</TableHead>
                    <TableHead className="px-2">Disparo</TableHead>
                    <TableHead className="px-2">Observação</TableHead>
                    <TableHead className="px-2">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? 'Nenhum pedido encontrado com este telefone' : 'Nenhum pedido encontrado'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="px-2">
                          <input 
                            type="checkbox"
                            checked={selectedOrders.has(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                          />
                        </TableCell>
                        <TableCell className="px-2">
                          <Badge variant="outline" className="text-xs">#{order.id}</Badge>
                        </TableCell>
                        <TableCell className="px-2 text-xs">{formatPhoneForDisplay(order.customer_phone)}</TableCell>
                        <TableCell className="px-2 text-xs text-muted-foreground">
                          {order.customer?.instagram ? `@${order.customer.instagram.replace('@', '')}` : '-'}
                        </TableCell>
                        <TableCell className="px-2 text-xs whitespace-nowrap">{formatCurrency(order.total_amount)}</TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={order.is_paid}
                              onCheckedChange={() => togglePaidStatus(order.id, order.is_paid)}
                              disabled={processingIds.has(order.id)}
                              className="scale-90"
                            />
                            <Badge variant={order.is_paid ? 'default' : 'secondary'} className="text-xs">
                              {order.is_paid ? 'Pago' : 'Pendente'}
                            </Badge>
                            {processingIds.has(order.id) && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1">
                            {order.printed ? (
                              <Badge variant="default" className="flex items-center text-xs">
                                <Check className="h-3 w-3 mr-1" />
                                Imp
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Não imp</Badge>
                            )}
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => togglePrintedStatus(order.id, order.printed || false)}
                              title={order.printed ? "Desmarcar como impresso" : "Marcar como impresso"}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="px-2">
                          <Badge variant="outline" className="text-xs">{order.event_type}</Badge>
                        </TableCell>
                        <TableCell className="px-2 text-xs whitespace-nowrap">
                          {format(new Date(order.event_date + 'T00:00:00'), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1">
                            {editingTracking === order.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={trackingText}
                                  onChange={(e) => setTrackingText(e.target.value)}
                                  placeholder="Código"
                                  className="w-20 h-6 text-xs"
                                />
                                <Button 
                                  size="sm" 
                                  className="h-6 px-1"
                                  onClick={() => saveTrackingCode(order.id)}
                                  disabled={savingTracking === order.id}
                                >
                                  {savingTracking === order.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-6 px-1"
                                  onClick={() => {
                                    setEditingTracking(null);
                                    setTrackingText('');
                                  }}
                                >
                                  ✕
                                </Button>
                              </div>
                            ) : order.melhor_envio_tracking_code ? (
                              <Badge variant="default" className="text-xs flex items-center gap-1">
                                <Truck className="h-3 w-3" />
                                {order.melhor_envio_tracking_code}
                              </Badge>
                            ) : (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="h-6 text-xs px-2"
                                onClick={() => {
                                  setEditingTracking(order.id);
                                  setTrackingText('');
                                }}
                              >
                                <Truck className="h-3 w-3 mr-1" />
                                Add Rastreio
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1">
                            <MessageCircle 
                              className={cn(
                                "h-4 w-4",
                                order.item_added_delivered ? "text-green-500" : "text-muted-foreground"
                              )} 
                              title={
                                order.item_added_delivered 
                                  ? "Item adicionado entregue ✓✓" 
                                  : order.item_added_message_sent 
                                    ? "Aguardando entrega" 
                                    : "Não enviada"
                              }
                            />
                            {order.is_paid && (
                              <DollarSign 
                                className={cn(
                                  "h-4 w-4",
                                  order.payment_confirmation_delivered ? "text-green-500" : "text-muted-foreground"
                                )} 
                                title={
                                  order.payment_confirmation_delivered 
                                    ? "Pagamento confirmado ✓✓" 
                                    : order.payment_confirmation_sent 
                                      ? "Aguardando entrega" 
                                      : "Não enviada"
                                }
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1">
                            {editingObservation === order.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={observationText}
                                  onChange={(e) => setObservationText(e.target.value)}
                                  placeholder="Obs"
                                  className="w-24 h-6 text-xs"
                                />
                                <Button 
                                  size="sm"
                                  className="h-6 px-1"
                                  onClick={() => saveObservation(order.id)}
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-6 px-1"
                                  onClick={() => {
                                    setEditingObservation(null);
                                    setObservationText('');
                                  }}
                                >
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs max-w-20 truncate" title={order.observation || 'Sem observação'}>
                                  {order.observation || 'Sem obs'}
                                </span>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
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
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1">
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditingOrder(order);
                                setEditOrderOpen(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setViewingOrder(order);
                                setViewOrderOpen(true);
                              }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            
            {filteredOrders.length > 0 && (
              <div className="p-4 border-t bg-muted/30">
                <div className="text-sm text-muted-foreground">
                  Total de pedidos (filtro): {filteredOrders.length} | 
                  Pagos: {paidOrdersCount} | 
                  Pendentes: {unpaidOrdersCount} |
                  Valor total: {formatCurrencyLocal(totalSalesValue)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <EditOrderDialog 
          open={editOrderOpen}
          onOpenChange={setEditOrderOpen}
          order={editingOrder}
          onOrderUpdated={loadOrders}
        />

        <ViewOrderDialog 
          open={viewOrderOpen}
          onOpenChange={setViewOrderOpen}
          order={viewingOrder}
        />

        {/* Diálogo de confirmação de pagamento */}
        <AlertDialog open={paymentConfirmDialog.open} onOpenChange={(open) => setPaymentConfirmDialog({ open, orderId: open ? paymentConfirmDialog.orderId : null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogDescription className="text-base">
                Deseja marcar esse pedido como pago manualmente?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmMarkAsPaid}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ConfirmDialog />
      </div>
    </div>
  </div>
  );
};

export default Pedidos;
