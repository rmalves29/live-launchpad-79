import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
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
import { Loader2, CalendarIcon, Eye, Filter, Download, Printer, Check, FileText, Save, Edit, Trash2, MessageCircle, Send, ArrowLeft, BarChart3, DollarSign, Clock, Package, Search } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { EditOrderDialog } from '@/components/EditOrderDialog';
import { ViewOrderDialog } from '@/components/ViewOrderDialog';
import { useAuth } from '@/hooks/useAuth';
import { formatPhoneForDisplay, normalizeForStorage } from '@/lib/phone-utils';
import { whatsappService } from '@/lib/whatsapp-service';

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
          .select('name, cpf, street, number, complement, city, state, cep')
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
              product:products!cart_items_product_id_fkey (
                name,
                code,
                image_url
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
                product:products!cart_items_product_id_fkey (
                  name,
                  code,
                  image_url
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
    console.log('🔄 TOGGLE PAID STATUS INICIADO', { orderId, currentStatus });
    setProcessingIds(prev => new Set(prev).add(orderId));
    
    try {
      let messageSent = false;
      
      // Se está marcando como pago (de false para true)
      if (!currentStatus) {
        console.log('💰 Pedido sendo marcado como PAGO - tentando enviar mensagem');
        try {
          messageSent = await sendPaidOrderMessage(orderId);
          console.log('📨 Resultado do envio:', messageSent);
        } catch (msgError) {
          console.error('❌ Erro ao enviar mensagem:', msgError);
          // Continua mesmo se falhar o envio
        }
      }

      // Update payment status in database
      const updateData: any = { is_paid: !currentStatus };
      if (messageSent) {
        updateData.payment_confirmation_sent = true;
      }

      console.log('💾 Atualizando banco de dados:', updateData);
      const { error } = await supabaseTenant
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;
      
      // Update local state
      setOrders(prev => prev.map(order => 
        order.id === orderId 
          ? { ...order, is_paid: !currentStatus, payment_confirmation_sent: messageSent }
          : order
      ));

      console.log('✅ Status atualizado com sucesso');
      toast({
        title: 'Sucesso',
        description: `Pedido ${!currentStatus ? 'marcado como pago' : 'desmarcado como pago'}`
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
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('🚀 INÍCIO ENVIO CONFIRMAÇÃO PAGAMENTO');
    console.log('═══════════════════════════════════════════════');
    console.log('Order ID:', orderId);
    
    try {
      // Passo 1: Buscar pedido
      console.log('');
      console.log('📋 PASSO 1: Buscando pedido nos dados locais...');
      const order = orders.find(o => o.id === orderId);
      
      if (!order) {
        console.error('❌ ERRO: Pedido não encontrado!');
        alert('ERRO: Pedido não encontrado!');
        return false;
      }

      console.log('✅ Pedido encontrado:', {
        id: order.id,
        phone: order.customer_phone,
        tenant: order.tenant_id,
        amount: order.total_amount
      });

      // Passo 2: Buscar configuração WhatsApp
      console.log('');
      console.log('🔍 PASSO 2: Buscando configuração WhatsApp...');
      const { data: config, error: configError } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url, is_active')
        .eq('tenant_id', order.tenant_id)
        .eq('is_active', true)
        .maybeSingle();

      console.log('Resultado da query:', { config, configError });

      if (configError) {
        console.error('❌ ERRO ao buscar config:', configError);
        alert('ERRO ao buscar configuração WhatsApp: ' + configError.message);
        throw configError;
      }

      if (!config?.api_url) {
        console.error('❌ ERRO: URL não configurada!');
        // Configuração ausente - retornar silenciosamente
        return;
      }

      console.log('✅ Configuração encontrada:', config.api_url);

      // Passo 3: Enviar via Node.js (template será buscado no servidor)
      console.log('');
      console.log('📤 PASSO 3: Enviando para servidor Node.js...');
      console.log('🎨 O servidor buscará o template PAID_ORDER do banco');
      console.log('URL:', `${config.api_url}/send`);
      console.log('Payload:', {
        phone: order.customer_phone,
        order_id: order.id
      });

      const response = await fetch(`${config.api_url}/send`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: order.customer_phone,
          order_id: order.id
        })
      });

      console.log('📥 Response status:', response.status, response.statusText);

      const result = await response.json();
      console.log('📥 Response body:', result);

      if (!response.ok) {
        console.error('❌ ERRO na resposta:', result);
        throw new Error(result.error || 'Erro ao enviar');
      }

      console.log('');
      console.log('✅✅✅ SUCESSO! Mensagem enviada via template! ✅✅✅');
      console.log('═══════════════════════════════════════════════');
      console.log('');
      
      toast({
        title: 'Confirmação Enviada',
        description: 'Mensagem de pagamento enviada via WhatsApp usando template personalizado'
      });
      return true;
      
    } catch (error) {
      console.log('');
      console.log('❌❌❌ ERRO FATAL ❌❌❌');
      console.error('Erro completo:', error);
      console.log('Stack trace:', error instanceof Error ? error.stack : 'N/A');
      console.log('═══════════════════════════════════════════════');
      console.log('');
      
      // Toast de erro removido conforme solicitado
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

    if (!confirm(`Tem certeza que deseja deletar ${selectedOrders.size} pedido(s)? Esta ação não pode ser desfeita.`)) {
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
      const customerAddress = order.customer ? 
        `${order.customer.street || 'Endereço'}, ${order.customer.number || 'S/N'}${order.customer.complement ? `, ${order.customer.complement}` : ''}, ${order.customer.city || 'Cidade'} - ${order.customer.state || 'Estado'}, CEP: ${order.customer.cep || 'Não informado'}` 
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
          </div>

          <!-- Two Column Layout -->
          <div style="display: flex; gap: 20px; margin-bottom: 20px;">
            <!-- Left Column - Order Summary -->
            <div style="flex: 2;">
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

            <!-- Right Column - Shipping Info -->
            <div style="flex: 1;">
              <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: bold;">Informações do envio</h3>
              
              <div style="background-color: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                <div style="font-size: 10px; line-height: 1.4;">
                  <div style="margin-bottom: 6px;">${customerAddress}</div>
                </div>
              </div>

              <div style="margin-bottom: 14px;">
                <h4 style="margin: 0 0 6px 0; font-size: 11px; font-weight: bold;">Dados do envio</h4>
                <div style="font-size: 10px; line-height: 1.4;">
                  <div><strong>PAC</strong></div>
                  <div>R$ 23,00 - até 9 dias úteis</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Payment Information -->
          <div style="border-top: 1px solid #ddd; padding-top: 14px;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: bold;">Forma de pagamento (1)</h3>
            
            <div style="background-color: #f8f9fa; padding: 10px; border-radius: 6px;">
              <div style="font-size: 10px; line-height: 1.4;">
                <div style="margin-bottom: 6px;"><strong>Pix - mercado pago</strong></div>
                <div style="margin-bottom: 3px;">R$ ${order.total_amount.toFixed(2)} - Data do pagamento: ${format(new Date(order.created_at), 'dd/MM/yy')}</div>
                ${order.observation ? `
                  <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                    <div style="font-weight: bold; margin-bottom: 3px;">Observações do pagamento</div>
                    <div>${order.observation}</div>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="margin-top: 20px; text-align: center; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 10px;">
            <div><strong>Total do pedido: R$ ${order.total_amount.toFixed(2)}</strong></div>
            <div style="margin-top: 3px;">Status: ${order.is_paid ? 'Pago' : 'Pendente'}</div>
            <div style="margin-top: 3px;">Pedido #${order.id} - ${format(new Date(order.created_at), 'dd/MM/yyyy \'às\' HH:mm')}</div>
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

      if (!confirm(`Tem certeza que deseja enviar mensagem em massa para ${uniquePhones.length} cliente(s)?`)) {
        setLoading(false);
        return;
      }

      // Preparar mensagens personalizadas
      const messages = uniquePhones.map(phone => {
        const customerName = orders.find(o => o.customer_phone === phone)?.customer?.name || 'Cliente';
        return template.content.replace('{{nome_cliente}}', customerName);
      });

      // Usar o whatsappService para envio de broadcast
      const result = await whatsappService.broadcastByPhones(uniquePhones, template.content, currentTenantId);
      
      // Registrar no banco independente do sucesso
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

      let successCount, errorCount;
      
      if (result && result.success) {
        successCount = result.total || uniquePhones.length;
        errorCount = 0;
      } else {
        successCount = 0;
        errorCount = uniquePhones.length;
      }

      toast({
        title: 'Mensagem em Massa Concluída',
        description: `${successCount} mensagem(s) enviada(s). ${errorCount > 0 ? `${errorCount} erro(s).` : ''}`,
        variant: successCount > 0 ? 'default' : 'destructive'
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
                  <TableHead>Mensagens</TableHead>
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
                      <TableCell>{formatPhoneForDisplay(order.customer_phone)}</TableCell>
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
                        {format(new Date(order.event_date + 'T00:00:00'), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {/* Indicador de mensagem de item adicionado */}
                          <div className="flex items-center gap-1" title="Mensagem de item adicionado">
                            <MessageCircle className="h-3 w-3" />
                            {order.item_added_message_sent ? '✅' : '☑️'}
                          </div>
                          {/* Indicador de confirmação de pagamento */}
                          {order.is_paid && (
                            <div className="flex items-center gap-1" title="Confirmação de pagamento enviada">
                              <Send className="h-3 w-3" />
                              {order.payment_confirmation_sent ? '✅' : '☑️'}
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
                Valor total: R$ {orders.reduce((sum, o) => sum + o.total_amount, 0).toFixed(2)}
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
        </div>
      </div>
    </div>
  );
};

export default Pedidos;