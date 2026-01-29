import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBrasiliaDate, formatBrasiliaDateTime, getBrasiliaDateTimeISO } from '@/lib/date-utils';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, CalendarIcon, Eye, Filter, Download, Printer, Check, FileText, Save, Edit, Trash2, MessageCircle, Send, ArrowLeft, BarChart3, DollarSign, Clock, Package, Search } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, formatCurrency } from '@/lib/utils';
import { EditOrderDialog } from '@/components/EditOrderDialog';
import { ViewOrderDialog } from '@/components/ViewOrderDialog';
import { useAuth } from '@/hooks/useAuth';
import { formatPhoneForDisplay, normalizeForStorage, normalizeForSending } from '@/lib/phone-utils';

interface Order {
  id: number;
  tenant_order_number?: number;
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

  // Filtros específicos para Mensagem em Massa
  const [broadcastPaid, setBroadcastPaid] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [broadcastDateMode, setBroadcastDateMode] = useState<'all' | 'specific'>('all');
  const [broadcastDate, setBroadcastDate] = useState<Date | undefined>(undefined);

  const loadOrders = async () => {
    try {
      setLoading(true);
      
      // Query 1: Buscar pedidos com limite para paginação inicial
      let query = supabaseTenant
        .from('orders')
        .select('*, tenant_id')
        .order('created_at', { ascending: false })
        .limit(100); // Limitar para melhor performance

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
      
      if (!orderData || orderData.length === 0) {
        setOrders([]);
        return;
      }

      // OTIMIZAÇÃO: Batch loading em vez de N+1 queries
      
      // Coletar todos os telefones únicos e cart_ids únicos
      const uniquePhones = [...new Set(orderData.map(o => o.customer_phone).filter(Boolean))];
      const cartIds = orderData.map(o => o.cart_id).filter(Boolean) as number[];
      const uniqueCartIds = [...new Set(cartIds)];

      // Query 2: Buscar todos os clientes de uma vez
      const { data: allCustomers } = await supabaseTenant
        .from('customers')
        .select('phone, name, cpf, street, number, complement, neighborhood, city, state, cep')
        .in('phone', uniquePhones);

      // Criar mapa de clientes por telefone
      const customersByPhone = new Map<string, any>();
      (allCustomers || []).forEach(c => customersByPhone.set(c.phone, c));

      // Query 3: Buscar todos os cart_items de uma vez (apenas para os que têm cart_id)
      let allCartItems: any[] = [];
      if (uniqueCartIds.length > 0) {
        const { data } = await supabaseTenant
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
              image_url
            )
          `)
          .in('cart_id', uniqueCartIds);
        allCartItems = data || [];
      }

      // Criar mapa de cart_items por cart_id
      const cartItemsByCartId = new Map<number, any[]>();
      allCartItems.forEach(item => {
        const existing = cartItemsByCartId.get(item.cart_id) || [];
        existing.push(item);
        cartItemsByCartId.set(item.cart_id, existing);
      });

      // Montar pedidos com detalhes (sem queries adicionais)
      const ordersWithDetails = orderData.map(order => ({
        ...order,
        customer: customersByPhone.get(order.customer_phone) || undefined,
        cart_items: order.cart_id ? (cartItemsByCartId.get(order.cart_id) || []) : []
      }));

      setOrders(ordersWithDetails);
    } catch (error: any) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar pedidos',
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
      } catch (error: any) {
        toast({
          title: 'Erro',
          description: error?.message || 'Erro ao atualizar status',
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

    // Se está MARCANDO como pago, pede confirmação
    const confirmed = await confirm({
      description: 'Deseja marcar este pedido como pago e enviar a confirmação por WhatsApp?',
      confirmText: 'Confirmar',
    });
    
    if (!confirmed) {
      return;
    }

    setProcessingIds(prev => new Set(prev).add(orderId));
    
    try {
      let messageSent = false;
      
      console.log('💰 Pedido sendo marcado como PAGO - enviando mensagem');
      try {
        messageSent = await sendPaidOrderMessage(orderId);
        console.log('📨 Resultado do envio:', messageSent);
      } catch (msgError) {
        console.error('❌ Erro ao enviar mensagem:', msgError);
        // Continua mesmo se falhar o envio
      }

      // Update payment status in database
      const updateData: any = { is_paid: true };
      if (messageSent) {
        updateData.payment_confirmation_sent = true;
      }

      const { error } = await supabaseTenant
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;
      
      // Update local state
      setOrders(prev => prev.map(order => 
        order.id === orderId 
          ? { ...order, is_paid: true, payment_confirmation_sent: messageSent }
          : order
      ));

      toast({
        title: 'Sucesso',
        description: 'Pedido marcado como pago'
      });

      // Sincronizar com Bling ERP (em background, não bloqueia o fluxo)
      if (profile?.tenant_id) {
        syncOrderWithBling(orderId, profile.tenant_id);
      }
    } catch (error: any) {
      console.error('❌ Erro ao atualizar status:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao atualizar status do pagamento',
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

  // Sincronizar pedido com Bling ERP
  const syncOrderWithBling = async (orderId: number, tenantId: string) => {
    try {
      // Verificar se a integração Bling está ativa
      const { data: blingIntegration } = await supabase
        .from('integration_bling')
        .select('is_active, sync_orders, access_token')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      // Só sincroniza se Bling estiver ativo e configurado
      if (!blingIntegration?.is_active || !blingIntegration?.sync_orders || !blingIntegration?.access_token) {
        console.log('📦 Bling ERP não está configurado ou sync_orders está desativado');
        return;
      }

      console.log('📦 Sincronizando pedido com Bling ERP...');
      const res = await supabase.functions.invoke('bling-sync-orders', { 
        body: {
          action: 'send_order',
          order_id: orderId,
          tenant_id: tenantId
        }
      });

      if (res.error) {
        console.error('❌ Erro ao sincronizar com Bling:', res.error);
        toast({
          title: 'Aviso',
          description: 'Pedido marcado como pago, mas houve erro na sincronização com Bling ERP',
          variant: 'destructive'
        });
      } else if (res.data?.success) {
        console.log('✅ Pedido sincronizado com Bling ERP:', res.data);
        toast({
          title: 'Bling ERP',
          description: 'Pedido sincronizado com sucesso!'
        });
      } else {
        console.warn('⚠️ Resposta inesperada do Bling:', res.data);
      }
    } catch (error) {
      console.error('❌ Erro ao sincronizar com Bling:', error);
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
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao salvar observação',
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
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao marcar pedidos como impressos',
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
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao alterar status de impressão',
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
          // Buscar itens do carrinho para restaurar estoque (apenas se pedido não foi pago)
          if (!order.is_paid && !order.is_cancelled) {
            const { data: cartItems } = await supabaseTenant
              .from('cart_items')
              .select('product_id, qty')
              .eq('cart_id', order.cart_id);

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
    } catch (error: any) {
      console.error('Error deleting orders:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao deletar pedidos',
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
        `${order.customer.street || 'Endereço'}, ${order.customer.number || 'S/N'}${order.customer.complement ? `, ${order.customer.complement}` : ''}, ${order.customer.neighborhood || ''} - ${order.customer.city || 'Cidade'} - ${order.customer.state || 'Estado'}, CEP: ${order.customer.cep || 'Não informado'}` 
        : 'Endereço não cadastrado';

      const cartItemsRows = order.cart_items && order.cart_items.length > 0 
        ? order.cart_items.map(item => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 6px; vertical-align: top; font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${item.product.image_url ? 
                    `<img src="${item.product.image_url}" alt="${item.product.name}" style="width: 40px; height: 40px; object-fit: cover; border: 1px solid #ddd; border-radius: 3px;" />` :
                    `<div style="width: 40px; height: 40px; border: 1px solid #ddd; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center; font-size: 10px; border-radius: 3px;">Sem foto</div>`
                  }
                  <div>
                    <div style="font-weight: bold; margin-bottom: 2px; font-size: 11px;">${item.product.name}</div>
                    <div style="font-size: 10px; color: #666;">Código: ${item.product.code}</div>
                  </div>
                </div>
              </td>
              <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: top; font-size: 11px;">
                R$ ${item.unit_price.toFixed(2)}
              </td>
              <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: top; font-size: 11px;">
                ${item.qty}
              </td>
              <td style="border: 1px solid #ddd; padding: 6px; text-align: right; vertical-align: top; font-size: 11px;">
                R$ ${(item.qty * item.unit_price).toFixed(2)}
              </td>
            </tr>
          `).join('')
        : `<tr>
             <td style="border: 1px solid #ddd; padding: 6px; font-size: 11px;" colspan="4">
               <div style="text-align: center; color: #666;">Produtos do pedido - detalhes não disponíveis</div>
             </td>
           </tr>`;

      return `
        <div style="page-break-after: always; padding: 14px; font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; font-size: 11px;">
          <!-- Header -->
          <div style="border-bottom: 1px solid #ddd; padding-bottom: 12px; margin-bottom: 14px;">
            <h1 style="margin: 0 0 6px 0; font-size: 16px; font-weight: bold;">${customerName}</h1>
            <div style="display: flex; gap: 14px; margin-bottom: 6px; font-size: 10px;">
              <span><strong>CPF:</strong> ${customerCPF}</span>
              <span><strong>Celular:</strong> ${formatPhoneForDisplay(order.customer_phone)}</span>
            </div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
              <div style="font-size: 10px; line-height: 1.5;">
                <strong style="display: block; margin-bottom: 3px;">Endereço de entrega:</strong>
                ${customerAddress}
              </div>
            </div>
          </div>

          <!-- Order Summary -->
          <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 3px;">
              Resumo do pedido (${order.cart_items?.length || 0})
            </h3>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px;">
              <thead>
                <tr style="background-color: #f8f9fa;">
                  <th style="border: 1px solid #ddd; padding: 5px; text-align: left; font-size: 10px;">Produto</th>
                  <th style="border: 1px solid #ddd; padding: 5px; text-align: center; width: 60px; font-size: 10px;">Unitário</th>
                  <th style="border: 1px solid #ddd; padding: 5px; text-align: center; width: 40px; font-size: 10px;">Qtd</th>
                  <th style="border: 1px solid #ddd; padding: 5px; text-align: center; width: 60px; font-size: 10px;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${cartItemsRows}
              </tbody>
            </table>
          </div>

          <!-- Payment Information -->
          <div style="border-top: 1px solid #ddd; padding-top: 14px;">
            <div style="display: flex; gap: 16px;">
              <!-- Payment Method -->
              <div style="flex: 1;">
                <h3 style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold;">Forma de pagamento</h3>
                <div style="background-color: #f8f9fa; padding: 10px; border-radius: 6px; height: 100%;">
                  <div style="font-size: 10px; line-height: 1.5;">
                    <div style="margin-bottom: 4px;"><strong>Pix - mercado pago</strong></div>
                    <div>R$ ${order.total_amount.toFixed(2)}</div>
                    <div style="color: #666; margin-top: 4px;">Data: ${formatBrasiliaDate(order.created_at)}</div>
                  </div>
                </div>
              </div>

              <!-- Payment Observations -->
              ${order.observation ? `
                <div style="flex: 1;">
                  <h3 style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold;">Observações do pagamento</h3>
                  <div style="background-color: #f8f9fa; padding: 10px; border-radius: 6px; height: 100%;">
                    <div style="font-size: 10px; line-height: 1.5;">
                      ${order.observation}
                    </div>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Footer -->
          <div style="margin-top: 20px; text-align: center; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 10px;">
            <div><strong>Total do pedido: R$ ${order.total_amount.toFixed(2)}</strong></div>
            <div style="margin-top: 3px;">Status: ${order.is_paid ? 'Pago' : 'Pendente'}</div>
            <div style="margin-top: 3px;">Pedido #${order.tenant_order_number || order.id} - ${formatBrasiliaDateTime(order.created_at)}</div>
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
          sent_at: getBrasiliaDateTimeISO(),
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
        formatBrasiliaDateTime(order.created_at)
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

  // Contar pedidos por telefone para identificar clientes com múltiplos pedidos
  const orderCountByPhone = orders.reduce((acc, order) => {
    const normalizedPhone = normalizeForStorage(order.customer_phone);
    acc[normalizedPhone] = (acc[normalizedPhone] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
                  <TableHead>Disparo</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? 'Nenhum pedido encontrado com este telefone' : 'Nenhum pedido encontrado'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{formatPhoneForDisplay(order.customer_phone)}</span>
                          {(() => {
                            const normalizedPhone = normalizeForStorage(order.customer_phone);
                            const count = orderCountByPhone[normalizedPhone] || 1;
                            if (count > 1) {
                              return (
                                <Badge 
                                  variant="secondary" 
                                  className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                >
                                  {count} pedidos
                                </Badge>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(order.total_amount)}</TableCell>
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
                        <div className="flex items-center gap-2">
                          {order.printed ? (
                            <Badge variant="default" className="flex items-center">
                              <Check className="h-3 w-3 mr-1" />
                              Impresso
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Não impresso</Badge>
                          )}
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => togglePrintedStatus(order.id, order.printed || false)}
                            title={order.printed ? "Desmarcar como impresso" : "Marcar como impresso"}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.event_type}</Badge>
                      </TableCell>
                      <TableCell>
                        {formatBrasiliaDate(order.event_date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {/* Indicador de mensagem de item adicionado - só mostra verde se entregue */}
                          <div 
                            className="flex items-center gap-1" 
                            title={
                              order.item_added_delivered 
                                ? "Mensagem de item adicionado entregue ✓✓" 
                                : order.item_added_message_sent 
                                  ? "Mensagem enviada, aguardando confirmação de entrega" 
                                  : "Mensagem de item adicionado não enviada"
                            }
                          >
                            <MessageCircle 
                              className={cn(
                                "h-4 w-4",
                                order.item_added_delivered ? "text-green-500" : "text-muted-foreground"
                              )} 
                            />
                          </div>
                          {/* Indicador de confirmação de pagamento - só mostra verde se entregue */}
                          {order.is_paid && (
                            <div 
                              className="flex items-center gap-1" 
                              title={
                                order.payment_confirmation_delivered 
                                  ? "Confirmação de pagamento entregue ✓✓" 
                                  : order.payment_confirmation_sent 
                                    ? "Confirmação enviada, aguardando entrega" 
                                    : "Confirmação de pagamento não enviada"
                              }
                            >
                              <DollarSign 
                                className={cn(
                                  "h-4 w-4",
                                  order.payment_confirmation_delivered ? "text-green-500" : "text-muted-foreground"
                                )} 
                              />
                            </div>
                          )}
                        </div>
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
                         <div className="flex items-center gap-2">
                           <Button 
                             size="sm" 
                             variant="outline"
                             onClick={() => {
                               setEditingOrder(order);
                               setEditOrderOpen(true);
                             }}
                           >
                             <Edit className="h-4 w-4" />
                           </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setViewingOrder(order);
                                setViewOrderOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                         </div>
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
                Valor total: {formatCurrency(orders.reduce((sum, o) => sum + o.total_amount, 0))}
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
      <ConfirmDialog />
        </div>
      </div>
    </div>
  );
};

export default Pedidos;
