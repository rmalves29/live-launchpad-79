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
import { Loader2, CalendarIcon, Eye, Filter, Download, Printer, Check, FileText, Save, Edit, Trash2, MessageCircle, Send, ArrowLeft, BarChart3, DollarSign, Clock, Package, Search, Truck, RefreshCw, Ban, RotateCcw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, formatCurrency } from '@/lib/utils';
import { formatBrasiliaDate, formatBrasiliaDateTime, getBrasiliaDateTimeISO, getBrasiliaDateISO } from '@/lib/date-utils';
import { EditOrderDialog } from '@/components/EditOrderDialog';
import { ViewOrderDialog } from '@/components/ViewOrderDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { formatPhoneForDisplay, normalizeForStorage, normalizeForSending } from '@/lib/phone-utils';
import { printMultipleThermalReceipts } from '@/components/ThermalReceipt';
  interface Order {
    id: number;
    tenant_order_number?: number;
    customer_phone: string;
    event_type: string;
    event_date: string;
    total_amount: number;
    is_paid: boolean;
    is_cancelled?: boolean;
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
    bling_order_id?: number;
    customer?: {
      name?: string;
      cpf?: string;
      street?: string;
      number?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      cep?: string;
      instagram?: string;
      bling_contact_id?: number;
    };
    cart_items?: {
      id: number;
      qty: number;
      unit_price: number;
      product_name?: string;
      product_code?: string;
      product_image_url?: string;
      product: {
        name: string;
        code: string;
        image_url?: string;
        color?: string;
        size?: string;
      } | null;
    }[];
  }

  const Pedidos = () => {
    const { toast } = useToast();
    const { confirm, confirmDialogElement } = useConfirmDialog();
    const { profile } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterPaid, setFilterPaid] = useState<string>('all'); // 'all' | 'paid' | 'unpaid' | 'cancelled'
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

    const ensureOrderCartItems = async (order: Order): Promise<Order> => {
      if (!order?.cart_id) return order;
      if (order.cart_items && order.cart_items.length > 0) return order;

      try {
        // Para super_admin (ou cenários multi-tenant), buscamos os itens do carrinho
        // usando o client raw, mas filtrando explicitamente pelo tenant do pedido.
        const { data, error } = await supabaseTenant.raw
          .from('cart_items')
          .select(`
            id,
            cart_id,
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
          .eq('cart_id', order.cart_id)
          .eq('tenant_id', order.tenant_id);

        if (error) throw error;

        return {
          ...order,
          cart_items: (data as any[]) || [],
        };
      } catch (e) {
        console.warn('Falha ao carregar itens do pedido para visualização:', {
          orderId: order.id,
          cartId: order.cart_id,
          tenantId: order.tenant_id,
          error: e,
        });
        return order;
      }
    };
    
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
    
    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const loadOrders = async () => {
      try {
        setLoading(true);
        
        // 1. Buscar pedidos com filtros aplicados (query otimizada)
        let query = supabaseTenant
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500); // Limitar para performance

        if (filterPaid === 'paid') {
          query = query.eq('is_paid', true).eq('is_cancelled', false);
        } else if (filterPaid === 'unpaid') {
          query = query.eq('is_paid', false).eq('is_cancelled', false);
        } else if (filterPaid === 'cancelled') {
          query = query.eq('is_cancelled', true);
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
        
        if (!orderData || orderData.length === 0) {
          setOrders([]);
          return;
        }

        // 2. BATCH LOADING: Buscar todos os dados relacionados de uma vez
        
        // Extrair IDs únicos para batch queries
        const uniquePhones = [...new Set(orderData.map(o => o.customer_phone))];
        const cartIds = orderData.filter(o => o.cart_id).map(o => o.cart_id!);
        const uniqueCartIds = [...new Set(cartIds)];

        // Batch query para clientes (uma única query para todos os telefones)
        const { data: allCustomers } = await supabaseTenant
          .from('customers')
          .select('phone, name, cpf, street, number, complement, neighborhood, city, state, cep, instagram, bling_contact_id')
          .in('phone', uniquePhones);

        // Criar mapa de clientes por telefone para lookup O(1)
        const customerMap = new Map<string, any>();
        (allCustomers || []).forEach(c => customerMap.set(c.phone, c));

        // Batch query para cart_items (uma única query para todos os cart_ids)
        // NOTA: Usamos fromGlobal porque super_admins podem visualizar pedidos de outros tenants
        // e os cart_ids já garantem a segurança dos dados
        let allCartItems: any[] = [];
        if (uniqueCartIds.length > 0) {
          const { data: cartItemsData } = await supabaseTenant.raw
            .from('cart_items')
            .select(`
              id,
              cart_id,
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
            .in('cart_id', uniqueCartIds);
          allCartItems = cartItemsData || [];
        }

        // Criar mapa de cart_items por cart_id para lookup O(1)
        const cartItemsMap = new Map<number, any[]>();
        allCartItems.forEach(item => {
          const existing = cartItemsMap.get(item.cart_id) || [];
          existing.push(item);
          cartItemsMap.set(item.cart_id, existing);
        });

        // 3. Montar resultado final com lookups O(1)
        const ordersWithDetails = orderData.map(order => ({
          ...order,
          customer: customerMap.get(order.customer_phone) || undefined,
          cart_items: order.cart_id ? (cartItemsMap.get(order.cart_id) || []) : []
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
        // Buscar tenant_id do pedido
        const { data: orderData } = await supabaseTenant
          .from('orders')
          .select('tenant_id')
          .eq('id', orderId)
          .single();

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

        // Sincronizar com Bling ERP em background
        if (orderData?.tenant_id) {
          supabase.functions.invoke('bling-sync-orders', {
            body: {
              action: 'send_order',
              order_id: orderId,
              tenant_id: orderData.tenant_id
            }
          }).then(res => {
            if (res.error) {
              console.log('Bling sync skipped or failed:', res.error);
            } else {
              console.log('✅ Pedido sincronizado com Bling');
            }
          }).catch(err => console.log('Bling sync error:', err));
        }
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
            shipped_at: getBrasiliaDateTimeISO()
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

    const toggleCancelledStatus = async (orderId: number, currentStatus: boolean) => {
      const order = orders.find(o => o.id === orderId);
      
      // Não permitir cancelar pedido já pago
      if (!currentStatus && order?.is_paid) {
        toast({
          title: 'Não permitido',
          description: 'Pedidos pagos não podem ser cancelados',
          variant: 'destructive'
        });
        return;
      }

      const actionText = currentStatus ? 'reverter o cancelamento' : 'cancelar';
      const orderNumber = order?.tenant_order_number || orderId;
      const confirmed = await confirm({
        description: `Deseja ${actionText} do pedido #${orderNumber}?`,
        confirmText: currentStatus ? 'Reverter' : 'Cancelar Pedido',
        variant: currentStatus ? 'default' : 'destructive',
      });

      if (!confirmed) return;

      setProcessingIds(prev => new Set(prev).add(orderId));
      
      try {
        // Se estamos CANCELANDO o pedido, devolver o estoque
        if (!currentStatus && order?.cart_id) {
          // Buscar itens do carrinho
          const { data: cartItems, error: cartError } = await supabaseTenant
            .from('cart_items')
            .select('product_id, qty')
            .eq('cart_id', order.cart_id);

          if (!cartError && cartItems && cartItems.length > 0) {
            // Devolver estoque de cada produto
            for (const item of cartItems) {
              if (item.product_id) {
                // Buscar estoque atual
                const { data: product } = await supabaseTenant
                  .from('products')
                  .select('stock')
                  .eq('id', item.product_id)
                  .maybeSingle();

                if (product) {
                  const newStock = (product.stock || 0) + (item.qty || 1);
                  await supabaseTenant
                    .from('products')
                    .update({ stock: newStock })
                    .eq('id', item.product_id);
                  
                  console.log(`Estoque devolvido: +${item.qty} para produto ${item.product_id}, novo estoque: ${newStock}`);
                }
              }
            }
          }
        }

        const { error } = await supabaseTenant
          .from('orders')
          .update({ is_cancelled: !currentStatus })
          .eq('id', orderId);

        if (error) throw error;

        setOrders(prev => prev.map(order => 
          order.id === orderId 
            ? { ...order, is_cancelled: !currentStatus }
            : order
        ));

        toast({
          title: 'Sucesso',
          description: currentStatus ? 'Cancelamento revertido' : 'Pedido cancelado e estoque devolvido'
        });
      } catch (error) {
        console.error('Erro ao alterar status de cancelamento:', error);
        toast({
          title: 'Erro',
          description: 'Erro ao alterar status do pedido',
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

    const cancelSelectedOrders = async () => {
      if (selectedOrders.size === 0) {
        toast({
          title: 'Aviso',
          description: 'Selecione pelo menos um pedido para cancelar',
          variant: 'destructive'
        });
        return;
      }

      // Verificar se algum pedido selecionado já está pago
      const selectedOrdersList = orders.filter(o => selectedOrders.has(o.id));
      const paidOrders = selectedOrdersList.filter(o => o.is_paid && !o.is_cancelled);
      
      if (paidOrders.length > 0) {
        toast({
          title: 'Aviso',
          description: `${paidOrders.length} pedido(s) pago(s) não podem ser cancelados. Remova-os da seleção.`,
          variant: 'destructive'
        });
        return;
      }

      const cancelableOrders = selectedOrdersList.filter(o => !o.is_paid && !o.is_cancelled);
      
      if (cancelableOrders.length === 0) {
        toast({
          title: 'Aviso',
          description: 'Nenhum pedido pode ser cancelado (já cancelados ou pagos)',
          variant: 'destructive'
        });
        return;
      }

      const confirmed = await confirm({
        description: `Deseja cancelar ${cancelableOrders.length} pedido(s)? O estoque dos produtos será devolvido.`,
        confirmText: 'Cancelar Pedidos',
        variant: 'destructive',
      });

      if (!confirmed) return;

      try {
        // Devolver estoque de cada pedido antes de cancelar
        for (const orderToCancel of cancelableOrders) {
          if (orderToCancel.cart_id) {
            const { data: cartItems } = await supabaseTenant
              .from('cart_items')
              .select('product_id, qty')
              .eq('cart_id', orderToCancel.cart_id);

            if (cartItems && cartItems.length > 0) {
              for (const item of cartItems) {
                if (item.product_id) {
                  const { data: product } = await supabaseTenant
                    .from('products')
                    .select('stock')
                    .eq('id', item.product_id)
                    .maybeSingle();

                  if (product) {
                    const newStock = (product.stock || 0) + (item.qty || 1);
                    await supabaseTenant
                      .from('products')
                      .update({ stock: newStock })
                      .eq('id', item.product_id);
                  }
                }
              }
            }
          }
        }

        const { error } = await supabaseTenant
          .from('orders')
          .update({ is_cancelled: true })
          .in('id', cancelableOrders.map(o => o.id));

        if (error) throw error;

        setOrders(prev => prev.map(order => 
          cancelableOrders.some(o => o.id === order.id)
            ? { ...order, is_cancelled: true }
            : order
        ));

        setSelectedOrders(new Set());

        toast({
          title: 'Sucesso',
          description: `${cancelableOrders.length} pedido(s) cancelado(s) e estoque devolvido`
        });
      } catch (error) {
        console.error('Erro ao cancelar pedidos:', error);
        toast({
          title: 'Erro',
          description: 'Erro ao cancelar pedidos',
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
        // Restaurar estoque e deletar cart items
        for (const orderId of selectedOrders) {
          const order = orders.find(o => o.id === orderId);
          if (order?.cart_id) {
            // SEMPRE restaurar estoque se o pedido não foi PAGO
            // (pedidos cancelados também precisam ter o estoque restaurado se ainda não foi feito)
            if (!order.is_paid) {
              const { data: cartItems } = await supabaseTenant
                .from('cart_items')
                .select('product_id, qty')
                .eq('cart_id', order.cart_id);

              if (cartItems && cartItems.length > 0) {
                console.log(`[deleteOrders] Restaurando estoque para pedido #${orderId} (is_cancelled: ${order.is_cancelled})`);
                for (const item of cartItems) {
                  if (item.product_id) {
                    const { data: product } = await supabaseTenant
                      .from('products')
                      .select('stock')
                      .eq('id', item.product_id)
                      .maybeSingle();

                    if (product) {
                      const newStock = (product.stock || 0) + (item.qty || 1);
                      await supabaseTenant
                        .from('products')
                        .update({ stock: newStock })
                        .eq('id', item.product_id);
                      console.log(`[deleteOrders] Estoque restaurado: +${item.qty || 1} para produto ${item.product_id}, novo estoque: ${newStock}`);
                    }
                  }
                }
              }
            }

            // Deletar cart items e cart
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
          description: `${selectedOrders.size} pedido(s) deletado(s) e estoque devolvido`
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

    const exportSelectedOrders = async () => {
      if (selectedOrders.size === 0) {
        toast({
          title: 'Aviso',
          description: 'Selecione pelo menos um pedido para exportar',
          variant: 'destructive'
        });
        return;
      }

      const selectedOrdersData = orders.filter(order => selectedOrders.has(order.id));
      await generateOrderReport(selectedOrdersData);
    };

    const generateOrderReport = async (ordersToExport: Order[]) => {
      // Garantir que os pedidos têm cart_items antes de imprimir.
      // Importante para super_admin/multi-tenant: não podemos depender do filtro automático do supabaseTenant.
      try {
        const ordersNeedingItems = ordersToExport.filter(o => o.cart_id && (!o.cart_items || o.cart_items.length === 0));
        const cartIds = [...new Set(ordersNeedingItems.map(o => o.cart_id!).filter(Boolean))];

        if (cartIds.length > 0) {
          const { data: cartItemsData, error: cartItemsError } = await supabaseTenant.raw
            .from('cart_items')
            .select(`
              id,
              cart_id,
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
            .in('cart_id', cartIds);

          if (cartItemsError) throw cartItemsError;

          const cartItemsMap = new Map<number, any[]>();
          (cartItemsData || []).forEach((item: any) => {
            const existing = cartItemsMap.get(item.cart_id) || [];
            existing.push(item);
            cartItemsMap.set(item.cart_id, existing);
          });

          ordersToExport = ordersToExport.map((o) => ({
            ...o,
            cart_items: o.cart_id ? (cartItemsMap.get(o.cart_id) || o.cart_items || []) : (o.cart_items || []),
          }));
        }
      } catch (e) {
        console.warn('Falha ao pré-carregar itens para impressão:', e);
        toast({
          title: 'Aviso',
          description: 'Não foi possível carregar os produtos para impressão de alguns pedidos.',
          variant: 'destructive',
        });
      }

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
              const productName = item.product?.name || item.product_name || 'Produto removido';
              const productCode = item.product?.code || item.product_code || '-';
              const productImage = item.product?.image_url || item.product_image_url;
              const productColor = item.product?.color;
              const productSize = item.product?.size;

              const variations = [];
              if (productColor) variations.push(`Cor: ${productColor}`);
              if (productSize) variations.push(`Tam: ${productSize}`);
              const variationsHtml = variations.length > 0 
                ? `<div style="font-size: 9px; color: #888; margin-top: 2px;">${variations.join(' | ')}</div>` 
                : '';
              
              return `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px; vertical-align: middle;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${productImage ? 
                      `<img src="${productImage}" alt="${productName}" style="width: 70px; height: 70px; object-fit: cover; border: 1px solid #ddd; border-radius: 6px; flex-shrink: 0;" />` :
                      `<div style="width: 70px; height: 70px; border: 1px solid #ddd; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center; font-size: 9px; border-radius: 6px; flex-shrink: 0; color: #999;">Sem foto</div>`
                    }
                    <div style="flex: 1;">
                      <div style="font-weight: 600; margin-bottom: 3px; font-size: 11px; color: #333;">${productName}</div>
                      <div style="font-size: 10px; color: #666; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; display: inline-block;">Código: ${productCode}</div>
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
                <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #1a1a2e;">${customerName} - #${order.tenant_order_number || order.id}</h1>
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
                  <span style="color: #4b5563;">${order.event_type || 'Não especificado'} - ${formatBrasiliaDate(order.event_date)}</span>
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
                  <div style="color: #4b5563; font-size: 12px; display: flex; align-items: center; gap: 4px;">📅 ${formatBrasiliaDate(order.created_at)}</div>
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
          order.tenant_order_number || order.id,
          order.customer_phone,
          order.total_amount,
          order.is_paid ? 'Sim' : 'Não',
          order.event_type,
          order.event_date,
          formatBrasiliaDateTime(order.created_at)
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `pedidos_${getBrasiliaDateISO()}.csv`);
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

    // Filtrar pedidos por telefone ou número do pedido
    const filteredOrders = orders.filter(order => {
      if (!searchTerm) return true;
      
      const search = searchTerm.trim().toLowerCase();
      
      // Buscar por número do pedido (com ou sem #)
      const orderNumber = search.replace('#', '');
      if (orderNumber && !isNaN(Number(orderNumber))) {
        const tenantOrderNum = String(order.tenant_order_number || '');
        const orderId = String(order.id);
        if (tenantOrderNum === orderNumber || orderId === orderNumber) {
          return true;
        }
      }
      
      // Normalizar o termo de busca e o telefone do pedido
      const normalizedSearch = normalizeForStorage(searchTerm);
      const normalizedPhone = normalizeForStorage(order.customer_phone);
      
      // Buscar também sem normalização (para busca parcial)
      return normalizedPhone.includes(normalizedSearch) || 
            order.customer_phone.includes(searchTerm) ||
            formatPhoneForDisplay(order.customer_phone).includes(searchTerm);
    });

    // Contar pedidos por telefone para identificar clientes com múltiplos pedidos
    // Exclui pedidos cancelados e só conta pedidos com até 3 dias de diferença entre eles
    const orderCountByPhone = (() => {
      // Agrupa pedidos não cancelados por telefone
      const ordersByPhone: Record<string, Order[]> = {};
      orders.forEach(order => {
        if (order.is_cancelled) return; // Ignora pedidos cancelados
        const normalizedPhone = normalizeForStorage(order.customer_phone);
        if (!ordersByPhone[normalizedPhone]) {
          ordersByPhone[normalizedPhone] = [];
        }
        ordersByPhone[normalizedPhone].push(order);
      });
      
      // Para cada telefone, conta apenas pedidos dentro de 3 dias de diferença
      const counts: Record<string, number> = {};
      Object.entries(ordersByPhone).forEach(([phone, phoneOrders]) => {
        if (phoneOrders.length <= 1) {
          counts[phone] = phoneOrders.length;
          return;
        }
        
        // Ordena por data do evento
        const sorted = [...phoneOrders].sort((a, b) => 
          new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
        );
        
        // Conta pedidos que estão dentro de 3 dias de diferença de algum outro pedido
        let validCount = 0;
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        
        for (let i = 0; i < sorted.length; i++) {
          const currentDate = new Date(sorted[i].event_date).getTime();
          let hasNearbyOrder = false;
          
          for (let j = 0; j < sorted.length; j++) {
            if (i === j) continue;
            const otherDate = new Date(sorted[j].event_date).getTime();
            if (Math.abs(currentDate - otherDate) <= THREE_DAYS_MS) {
              hasNearbyOrder = true;
              break;
            }
          }
          
          if (hasNearbyOrder) {
            validCount++;
          }
        }
        
        // Se nenhum pedido tem outro próximo, conta como 1 (pedido individual)
        counts[phone] = validCount > 0 ? validCount : 1;
      });
      
      return counts;
    })();

    // Estatísticas baseadas nos pedidos filtrados (para mostrar resumo do dia ou conforme filtros aplicados)
    const totalOrdersCount = filteredOrders.length;
    const paidOrdersCount = filteredOrders.filter(o => o.is_paid).length;
    const unpaidOrdersCount = totalOrdersCount - paidOrdersCount;
    const totalSalesValue = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const totalPaidValue = filteredOrders.filter(o => o.is_paid).reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const percentPaid = totalOrdersCount > 0 ? (paidOrdersCount / totalOrdersCount) * 100 : 0;
    const ticketMedio = totalOrdersCount > 0 ? (totalSalesValue / totalOrdersCount) : 0;

    // Paginação
    const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

    // Reset página quando filtros mudam
    useEffect(() => {
      setCurrentPage(1);
    }, [filterPaid, filterEventType, filterDate, searchTerm]);

    const formatCurrencyLocal = (value: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    return (
      <div className="min-h-screen bg-background">
        <div className="p-6">
          <div className="container mx-auto space-y-6">
            <div className="space-y-4">
              <h1 className="text-3xl font-bold">Gestão de Pedidos</h1>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={exportSelectedOrders} 
                  variant="outline"
                  disabled={selectedOrders.size === 0}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Imprimir Selecionados ({selectedOrders.size})
                </Button>
                <Button 
                  onClick={() => {
                    const selectedOrdersData = orders.filter(order => selectedOrders.has(order.id));
                    if (selectedOrdersData.length === 0) {
                      toast({ title: 'Aviso', description: 'Selecione pelo menos um pedido', variant: 'destructive' });
                      return;
                    }
                    printMultipleThermalReceipts(selectedOrdersData);
                  }} 
                  variant="outline"
                  disabled={selectedOrders.size === 0}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir - Térmica ({selectedOrders.size})
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
                  onClick={cancelSelectedOrders} 
                  variant="outline"
                  disabled={selectedOrders.size === 0}
                  className="text-orange-600 border-orange-300 hover:bg-orange-50"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Cancelar ({selectedOrders.size})
                </Button>
                <Button 
                  onClick={deleteSelectedOrders} 
                  variant="destructive"
                  disabled={selectedOrders.size === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Deletar ({selectedOrders.size})
                </Button>
                <Button onClick={exportToCSV} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
                <Button onClick={loadOrders} variant="outline" disabled={loading}>
                  <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                  Atualizar
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
                  placeholder="Buscar por telefone ou nº do pedido..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                <Select 
                  value={filterPaid} 
                  onValueChange={(value) => setFilterPaid(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pagos</SelectItem>
                    <SelectItem value="unpaid">Não pagos</SelectItem>
                    <SelectItem value="cancelled">Cancelados</SelectItem>
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
        <Card className="overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
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

            <Table className="text-xs w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px] min-w-[40px] px-2 text-center">
                    <input 
                      type="checkbox" 
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOrders(new Set(paginatedOrders.map(o => o.id)));
                        } else {
                          setSelectedOrders(new Set());
                        }
                      }}
                      checked={selectedOrders.size === paginatedOrders.length && paginatedOrders.length > 0}
                    />
                  </TableHead>
                  <TableHead className="w-[60px] min-w-[60px] px-2 text-center">#Pedido</TableHead>
                  <TableHead className="w-[140px] min-w-[140px] px-2">Telefone</TableHead>
                  <TableHead className="w-[80px] min-w-[80px] px-2 text-right">Total</TableHead>
                  <TableHead className="w-[80px] min-w-[80px] px-2 text-center">Pago?</TableHead>
                  <TableHead className="w-[80px] min-w-[80px] px-2 text-center">Impresso?</TableHead>
                  <TableHead className="w-[100px] min-w-[100px] px-2 text-center">Tipo Evento</TableHead>
                  <TableHead className="w-[100px] min-w-[100px] px-2 text-center">Data Evento</TableHead>
                  <TableHead className="w-[120px] min-w-[120px] px-2 text-center">Rastreio</TableHead>
                  <TableHead className="w-[60px] min-w-[60px] px-2 text-center">Disparo</TableHead>
                  <TableHead className="flex-1 min-w-[120px] px-2">Observação</TableHead>
                  <TableHead className="w-[60px] min-w-[60px] px-2 text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : paginatedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? 'Nenhum pedido encontrado para esta busca' : 'Nenhum pedido encontrado'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOrders.map((order) => (
                    <TableRow key={order.id} className={order.is_cancelled ? 'opacity-50 bg-muted/30' : ''}>
                      {/* Checkbox */}
                      <TableCell className="px-2 py-2 text-center">
                        <input 
                          type="checkbox"
                          checked={selectedOrders.has(order.id)}
                          onChange={() => toggleOrderSelection(order.id)}
                        />
                      </TableCell>
                      
                      {/* Número do Pedido (por tenant) */}
                      <TableCell className="px-2 py-2 text-center">
                        <Badge variant="outline" className="text-xs font-mono font-semibold">
                          #{order.tenant_order_number || order.id}
                        </Badge>
                      </TableCell>
                      
                      {/* Telefone + Badge múltiplos pedidos */}
                      <TableCell className="px-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium">{formatPhoneForDisplay(order.customer_phone)}</span>
                          {(() => {
                            const normalizedPhone = normalizeForStorage(order.customer_phone);
                            const count = orderCountByPhone[normalizedPhone] || 1;
                            if (count > 1) {
                              return (
                                <Badge 
                                  variant="secondary" 
                                  className="text-[10px] px-1.5 py-0 w-fit bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                >
                                  {count} pedidos
                                </Badge>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </TableCell>
                      
                      {/* Total */}
                      <TableCell className="px-2 py-2 text-right">
                        <span className="text-xs font-semibold">{formatCurrency(order.total_amount)}</span>
                      </TableCell>
                      
                      {/* Pago */}
                      <TableCell className="px-2 py-2 text-center">
                        {order.is_cancelled ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Cancelado
                          </Badge>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <Switch
                              checked={order.is_paid}
                              onCheckedChange={() => togglePaidStatus(order.id, order.is_paid)}
                              disabled={processingIds.has(order.id) || order.is_cancelled}
                              className="scale-75"
                            />
                            <Badge variant={order.is_paid ? 'default' : 'secondary'} className="text-[10px]">
                              {order.is_paid ? 'Pago' : 'Pendente'}
                            </Badge>
                            {processingIds.has(order.id) && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Impresso */}
                      <TableCell className="px-2 py-2 text-center">
                        <Badge 
                          variant={order.printed ? 'default' : 'outline'} 
                          className={cn("text-[10px] cursor-pointer", !order.printed && "text-muted-foreground")}
                          onClick={() => togglePrintedStatus(order.id, order.printed || false)}
                          title={order.printed ? "Impresso" : "Não impresso"}
                        >
                          {order.printed ? 'Impresso' : 'Não impresso'}
                        </Badge>
                      </TableCell>
                      
                      {/* Tipo Evento */}
                      <TableCell className="px-2 py-2 text-center">
                        <Badge variant="outline" className="text-[10px]">{order.event_type}</Badge>
                      </TableCell>
                      
                      {/* Data Evento */}
                      <TableCell className="px-2 py-2 text-center">
                        <span className="text-xs">{formatBrasiliaDate(order.event_date)}</span>
                      </TableCell>
                      
                      {/* Rastreio */}
                      <TableCell className="px-2 py-2">
                        {editingTracking === order.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={trackingText}
                              onChange={(e) => setTrackingText(e.target.value)}
                              placeholder="Código de rastreio"
                              className="h-7 text-xs flex-1"
                              disabled={savingTracking === order.id}
                            />
                            <Button 
                              size="sm" 
                              className="h-7 w-7 p-0" 
                              onClick={() => saveTrackingCode(order.id)}
                              disabled={savingTracking === order.id}
                            >
                              {savingTracking === order.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {order.melhor_envio_tracking_code ? (
                              <Badge 
                                variant="outline" 
                                className="text-[10px] font-mono cursor-pointer hover:bg-accent"
                                onClick={() => { setEditingTracking(order.id); setTrackingText(order.melhor_envio_tracking_code || ''); }}
                                title="Clique para editar"
                              >
                                {order.melhor_envio_tracking_code}
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => { setEditingTracking(order.id); setTrackingText(''); }}
                                title="Adicionar código de rastreio"
                              >
                                <Truck className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Disparo (Mensagens) */}
                      <TableCell className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <MessageCircle className={cn("h-4 w-4", order.item_added_delivered ? "text-green-500" : "text-muted-foreground/40")} title="Item adicionado" />
                        </div>
                      </TableCell>
                      
                      {/* Observação */}
                      <TableCell className="px-2 py-2">
                        {editingObservation === order.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={observationText}
                              onChange={(e) => setObservationText(e.target.value)}
                              placeholder="Observação"
                              className="h-7 text-xs flex-1"
                            />
                            <Button size="sm" className="h-7 w-7 p-0" onClick={() => saveObservation(order.id)}>
                              <Check className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="flex items-center cursor-pointer group"
                            onClick={() => { setEditingObservation(order.id); setObservationText(order.observation || ''); }}
                          >
                            <span className="text-xs truncate max-w-[150px]" title={order.observation || 'Sem observação'}>
                              {order.observation || <span className="text-muted-foreground">Sem observação</span>}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Ações */}
                      <TableCell className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingOrder(order); setEditOrderOpen(true); }} title="Editar">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={async () => {
                              const withItems = await ensureOrderCartItems(order);
                              setViewingOrder(withItems);
                              setViewOrderOpen(true);
                            }}
                            title="Visualizar"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {order.is_cancelled ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700"
                              onClick={() => toggleCancelledStatus(order.id, true)}
                              title="Reverter cancelamento"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : !order.is_paid ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => toggleCancelledStatus(order.id, false)}
                              title="Cancelar pedido"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            
            {filteredOrders.length > 0 && (
              <div className="p-4 border-t bg-muted/30">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {startIndex + 1}-{Math.min(endIndex, filteredOrders.length)} de {filteredOrders.length} pedidos | 
                    Pagos: {paidOrdersCount} | 
                    Pendentes: {unpaidOrdersCount} |
                    Total: {formatCurrencyLocal(totalSalesValue)}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                      <SelectTrigger className="w-20 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">por página</span>
                    
                    <div className="flex items-center gap-1 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm px-2">
                        {currentPage} / {totalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || totalPages === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages || totalPages === 0}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
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

        {confirmDialogElement}
      </div>
    </div>
  </div>
  );
};

export default Pedidos;
