import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Printer, Send, Loader2, Truck, MapPin, User, Phone, Copy, CheckCircle, CalendarIcon, FileText, RefreshCw, Settings, AlertCircle, ExternalLink, Pencil, Save, X, Square, CheckSquare, Ban, RotateCcw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Mapeamento de transportadoras para seleção
const CARRIER_OPTIONS = [
  { id: 1, name: 'Correios PAC', company: 'Correios' },
  { id: 2, name: 'Correios SEDEX', company: 'Correios' },
  { id: 17, name: 'Mini Envios', company: 'Correios' },
  { id: 3, name: 'Jadlog Package', company: 'Jadlog' },
  { id: 4, name: 'Jadlog .Com', company: 'Jadlog' },
];
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
  customer_cpf?: string; // CPF do cliente (buscado da tabela customers)
}

// Validar dados obrigatórios para criar remessa (incluindo CPF)
const validateOrderForShipment = (order: Order): { valid: boolean; missingFields: string[] } => {
  const missingFields: string[] = [];
  
  if (!order.customer_name) missingFields.push('Nome do cliente');
  if (!order.customer_cep) missingFields.push('CEP');
  if (!order.customer_street) missingFields.push('Rua');
  if (!order.customer_city) missingFields.push('Cidade');
  if (!order.customer_state) missingFields.push('Estado');
  // CPF é opcional - não bloqueia mais o envio
  // if (!order.customer_cpf) missingFields.push('CPF do cliente');
  
  return {
    valid: missingFields.length === 0,
    missingFields
  };
};

interface IntegrationLog {
  id: string;
  created_at: string;
  webhook_type: string;
  status_code: number;
  payload: {
    order_id?: number;
    action?: string;
    request?: any;
  };
  response: string;
  error_message?: string;
}

const Etiquetas = () => {
  const { isSuperAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingOrders, setProcessingOrders] = useState<Set<number>>(new Set());
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [activeTab, setActiveTab] = useState('etiquetas');
  const [syncingAll, setSyncingAll] = useState(false);
  
  // Busca por nome do cliente
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  
  // Estado para edição de código de rastreio
  const [editingTrackingOrderId, setEditingTrackingOrderId] = useState<number | null>(null);
  const [editingTrackingCode, setEditingTrackingCode] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);
  
  // Estado para edição de CPF do cliente
  const [editingCpfOrderId, setEditingCpfOrderId] = useState<number | null>(null);
  const [editingCpf, setEditingCpf] = useState('');
  const [savingCpf, setSavingCpf] = useState(false);
  
  // Estado para seleção de pedidos em lote
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Logs state (só usado por super_admin)
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<IntegrationLog | null>(null);

  useEffect(() => {
    if (!isSearchMode) {
      loadPaidOrders();
    }
  }, [dateFilter, isSearchMode]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab]);

  const loadPaidOrders = async () => {
    console.log('🔄 Carregando pedidos pagos...');
    setLoading(true);
    try {
      let query = supabaseTenant
        .from('orders')
        .select('*')
        .eq('is_paid', true);

      // Aplicar filtro de data se selecionada, senão usar últimos 10 dias
      if (dateFilter) {
        const startOfDay = new Date(dateFilter);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(dateFilter);
        endOfDay.setHours(23, 59, 59, 999);
        
        query = query
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString());
      } else {
        // Padrão: últimos 10 dias
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        tenDaysAgo.setHours(0, 0, 0, 0);
        
        query = query.gte('created_at', tenDaysAgo.toISOString());
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erro na query de pedidos:', error);
        throw error;
      }

      console.log('✅ Pedidos carregados:', data?.length || 0);
      
      if (!data || data.length === 0) {
        setOrders([]);
        return;
      }
      
      // Buscar todos os itens de carrinho de uma vez (otimização)
      const cartIds = data.filter(o => o.cart_id).map(o => o.cart_id);
      let allCartItems: any[] = [];
      
      if (cartIds.length > 0) {
        const { data: cartItemsData } = await supabaseTenant
          .from('cart_items')
          .select(`
            id,
            cart_id,
            qty,
            unit_price,
            product_name,
            product_code,
            product:products(name, code, image_url)
          `)
          .in('cart_id', cartIds);
        
        allCartItems = cartItemsData || [];
      }
      
      // Buscar dados de clientes (sempre buscar CPF para todos)
      const allPhones = data.map(o => o.customer_phone);
      
      let customersMap: Record<string, any> = {};
      
      if (allPhones.length > 0) {
        const { data: customersData } = await supabaseTenant
          .from('customers')
          .select('phone, name, cpf, cep, street, number, complement, neighborhood, city, state')
          .in('phone', allPhones);
        
        if (customersData) {
          customersMap = customersData.reduce((acc, c) => {
            acc[c.phone] = c;
            return acc;
          }, {} as Record<string, any>);
        }
      }
      
      // Montar os pedidos com itens e dados de clientes (incluindo CPF)
      const ordersWithItems = data.map(order => {
        const items = allCartItems.filter(item => item.cart_id === order.cart_id);
        const customer = customersMap[order.customer_phone];
        
        return {
          ...order,
          items,
          customer_name: order.customer_name || customer?.name,
          customer_cep: order.customer_cep || customer?.cep,
          customer_street: order.customer_street || customer?.street,
          customer_number: order.customer_number || customer?.number,
          customer_complement: order.customer_complement || customer?.complement,
          customer_city: order.customer_city || customer?.city,
          customer_state: order.customer_state || customer?.state,
          customer_cpf: customer?.cpf, // Sempre buscar o CPF do cliente
        };
      });

      console.log('✅ Pedidos com itens carregados:', ordersWithItems.length);
      setOrders(ordersWithItems);
    } catch (error: any) {
      console.error('❌ Erro ao carregar pedidos:', error);
      toast.error(error?.message || 'Erro ao carregar pedidos pagos');
    } finally {
      setLoading(false);
    }
  };

  // Busca de pedidos por nome do cliente
  const searchOrders = async () => {
    if (!searchQuery.trim()) {
      toast.error('Digite o nome do cliente para buscar');
      return;
    }
    
    setLoading(true);
    setIsSearchMode(true);
    
    try {
      const { data, error } = await supabaseTenant
        .from('orders')
        .select('*')
        .eq('is_paid', true)
        .ilike('customer_name', `%${searchQuery.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        setOrders([]);
        toast.info('Nenhum pedido encontrado para este cliente');
        return;
      }
      
      // Buscar itens e dados de clientes (mesma lógica otimizada)
      const cartIds = data.filter(o => o.cart_id).map(o => o.cart_id);
      let allCartItems: any[] = [];
      
      if (cartIds.length > 0) {
        const { data: cartItemsData } = await supabaseTenant
          .from('cart_items')
          .select(`id, cart_id, qty, unit_price, product_name, product_code, product:products(name, code, image_url)`)
          .in('cart_id', cartIds);
        allCartItems = cartItemsData || [];
      }
      
      // Buscar dados de clientes (sempre buscar CPF para todos)
      const allPhones = data.map(o => o.customer_phone);
      let customersMap: Record<string, any> = {};
      
      if (allPhones.length > 0) {
        const { data: customersData } = await supabaseTenant
          .from('customers')
          .select('phone, name, cpf, cep, street, number, complement, neighborhood, city, state')
          .in('phone', allPhones);
        if (customersData) {
          customersMap = customersData.reduce((acc, c) => { acc[c.phone] = c; return acc; }, {} as Record<string, any>);
        }
      }
      
      const ordersWithItems = data.map(order => {
        const items = allCartItems.filter(item => item.cart_id === order.cart_id);
        const customer = customersMap[order.customer_phone];
        return {
          ...order,
          items,
          customer_name: order.customer_name || customer?.name,
          customer_cep: order.customer_cep || customer?.cep,
          customer_street: order.customer_street || customer?.street,
          customer_number: order.customer_number || customer?.number,
          customer_complement: order.customer_complement || customer?.complement,
          customer_city: order.customer_city || customer?.city,
          customer_state: order.customer_state || customer?.state,
          customer_cpf: customer?.cpf, // Sempre buscar o CPF do cliente
        };
      });

      setOrders(ordersWithItems);
      toast.success(`${ordersWithItems.length} pedido(s) encontrado(s)`);
    } catch (error: any) {
      console.error('❌ Erro na busca:', error);
      toast.error('Erro ao buscar pedidos');
    } finally {
      setLoading(false);
    }
  };

  // Limpar busca e voltar ao modo padrão
  const clearSearch = () => {
    setSearchQuery('');
    setIsSearchMode(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const { data, error } = await supabaseTenant
        .from('webhook_logs')
        .select('*')
        .like('webhook_type', 'melhor_envio_%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar logs:', error);
      toast.error('Erro ao carregar logs de integração');
    } finally {
      setLogsLoading(false);
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
        console.error('❌ [ETIQUETAS] Erro da edge function:', error, 'Data:', data);
        // Extrair mensagem de erro: priorizar data.error, depois context do FunctionsHttpError
        let errorMessage = data?.error || data?.message;
        if (!errorMessage && error.context) {
          try {
            const contextBody = await error.context.json();
            errorMessage = contextBody?.error || contextBody?.message;
          } catch { }
        }
        errorMessage = errorMessage || error.message || `Erro na comunicação: ${JSON.stringify(error)}`;
        throw new Error(errorMessage);
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

      if (error) {
        console.error('❌ [ETIQUETAS] Erro ao comprar frete:', error, 'Data:', data);
        let errorMessage = data?.error || data?.message;
        if (!errorMessage && error.context) {
          try {
            const contextBody = await error.context.json();
            errorMessage = contextBody?.error || contextBody?.message;
          } catch { }
        }
        errorMessage = errorMessage || error.message || 'Erro ao comprar frete';
        throw new Error(errorMessage);
      }

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

      if (error) {
        console.error('❌ [ETIQUETAS] Erro ao gerar etiqueta:', error, 'Data:', data);
        let errorMessage = data?.error || data?.message;
        if (!errorMessage && error.context) {
          try {
            const contextBody = await error.context.json();
            errorMessage = contextBody?.error || contextBody?.message;
          } catch { }
        }
        errorMessage = errorMessage || error.message || 'Erro ao gerar etiqueta';
        throw new Error(errorMessage);
      }

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

  // Consultar status de um pedido específico
  const checkOrderStatus = async (orderId: number) => {
    setProcessingOrders(prev => new Set(prev).add(orderId));
    
    try {
      const { data, error } = await supabaseTenant.functions.invoke('melhor-envio-labels', {
        body: {
          action: 'get_status',
          order_id: orderId,
          tenant_id: supabaseTenant.getTenantId()
        }
      });

      if (error) {
        console.error('❌ [ETIQUETAS] Erro ao consultar status:', error, 'Data:', data);
        let errorMessage = data?.error || data?.message;
        if (!errorMessage && error.context) {
          try {
            const contextBody = await error.context.json();
            errorMessage = contextBody?.error || contextBody?.message;
          } catch { }
        }
        errorMessage = errorMessage || error.message || 'Erro ao consultar status';
        throw new Error(errorMessage);
      }

      if (data.success) {
        if (data.tracking) {
          toast.success(`Tracking encontrado: ${data.tracking}`);
        } else {
          toast.info(`Status: ${data.status || 'Sem tracking disponível ainda'}`);
        }
        loadPaidOrders();
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Erro ao consultar status:', error);
      toast.error(`Erro ao consultar status: ${error.message}`);
    } finally {
      setProcessingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  // Enviar mensagem de rastreio via WhatsApp
  const sendTrackingMessage = async (orderId: number, trackingCode: string) => {
    try {
      const { data, error } = await supabaseTenant.functions.invoke('zapi-send-tracking', {
        body: {
          order_id: orderId,
          tenant_id: supabaseTenant.getTenantId(),
          tracking_code: trackingCode,
          shipped_at: new Date().toISOString()
        }
      });

      if (error) {
        console.error('❌ Erro ao enviar mensagem de rastreio:', error);
        return false;
      }

      if (data?.success) {
        console.log('✅ Mensagem de rastreio enviada para pedido', orderId);
        return true;
      }
      return false;
    } catch (e) {
      console.error('❌ Erro ao enviar mensagem de rastreio:', e);
      return false;
    }
  };

  // Iniciar edição do código de rastreio
  const startEditingTracking = (orderId: number, currentCode: string) => {
    setEditingTrackingOrderId(orderId);
    setEditingTrackingCode(currentCode || '');
  };

  // Cancelar edição
  const cancelEditingTracking = () => {
    setEditingTrackingOrderId(null);
    setEditingTrackingCode('');
  };

  // Iniciar edição do CPF
  const startEditingCpf = (orderId: number, currentCpf: string) => {
    setEditingCpfOrderId(orderId);
    setEditingCpf(currentCpf || '');
  };

  // Cancelar edição do CPF
  const cancelEditingCpf = () => {
    setEditingCpfOrderId(null);
    setEditingCpf('');
  };

  // Formatar CPF enquanto digita
  const formatCpfInput = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
  };

  // Salvar CPF do cliente
  const saveCpf = async (orderId: number, customerPhone: string) => {
    const cpfNumbers = editingCpf.replace(/\D/g, '');
    if (cpfNumbers.length !== 11) {
      toast.error('CPF deve ter 11 dígitos');
      return;
    }

    setSavingCpf(true);
    try {
      // Atualizar na tabela customers usando o phone
      const { error } = await supabaseTenant
        .from('customers')
        .update({ cpf: cpfNumbers })
        .eq('phone', customerPhone);

      if (error) throw error;

      toast.success('CPF salvo com sucesso!');
      setEditingCpfOrderId(null);
      setEditingCpf('');
      
      // Recarregar pedidos para atualizar o CPF
      if (isSearchMode) {
        searchOrders();
      } else {
        loadPaidOrders();
      }
    } catch (error: any) {
      console.error('Erro ao salvar CPF:', error);
      toast.error(`Erro ao salvar CPF: ${error.message}`);
    } finally {
      setSavingCpf(false);
    }
  };

  // Salvar código de rastreio editado
  const saveTrackingCode = async (orderId: number) => {
    if (!editingTrackingCode.trim()) {
      toast.error('Digite um código de rastreio válido');
      return;
    }

    setSavingTracking(true);
    try {
      const trackingCode = editingTrackingCode.trim();
      
      const { error } = await supabaseTenant
        .from('orders')
        .update({ melhor_envio_tracking_code: trackingCode })
        .eq('id', orderId);

      if (error) throw error;

      // Enviar mensagem de rastreio via WhatsApp
      const messageSent = await sendTrackingMessage(orderId, trackingCode);
      
      if (messageSent) {
        toast.success('Código de rastreio salvo e mensagem enviada ao cliente!');
      } else {
        toast.success('Código de rastreio salvo! (Erro ao enviar WhatsApp)');
      }
      
      setEditingTrackingOrderId(null);
      setEditingTrackingCode('');
      loadPaidOrders();
    } catch (error: any) {
      console.error('Erro ao salvar código de rastreio:', error);
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setSavingTracking(false);
    }
  };

  // Sincronizar todos os pedidos com remessa no Melhor Envio
  const syncAllOrdersStatus = async () => {
    const ordersWithShipment = orders.filter(o => o.melhor_envio_shipment_id && !o.melhor_envio_tracking_code);
    
    if (ordersWithShipment.length === 0) {
      toast.info('Nenhum pedido pendente de tracking para sincronizar');
      return;
    }

    setSyncingAll(true);
    let updated = 0;
    let errors = 0;
    let messagesSent = 0;

    for (const order of ordersWithShipment) {
      try {
        const { data, error } = await supabaseTenant.functions.invoke('melhor-envio-labels', {
          body: {
            action: 'get_status',
            order_id: order.id,
            tenant_id: supabaseTenant.getTenantId()
          }
        });

        if (!error && data?.success && data?.tracking) {
          updated++;
          
          // Enviar mensagem de rastreio via WhatsApp
          const sent = await sendTrackingMessage(order.id, data.tracking);
          if (sent) {
            messagesSent++;
          }
        }
      } catch (e) {
        errors++;
        console.error(`Erro ao sincronizar pedido ${order.id}:`, e);
      }
      
      // Pequeno delay para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setSyncingAll(false);
    loadPaidOrders();
    
    if (updated > 0) {
      let message = `${updated} pedido(s) atualizado(s) com código de rastreio!`;
      if (messagesSent > 0) {
        message += ` ${messagesSent} mensagem(ns) de WhatsApp enviada(s).`;
      }
      toast.success(message);
    } else if (errors > 0) {
      toast.error(`${errors} erro(s) ao sincronizar. Verifique os logs.`);
    } else {
      toast.info('Nenhum tracking disponível ainda para os pedidos');
    }
  };

  // Pedidos elegíveis para seleção (pendentes e com dados válidos)
  const selectableOrders = orders.filter(o => !o.melhor_envio_shipment_id);
  const validSelectableOrders = selectableOrders.filter(o => validateOrderForShipment(o).valid);
  
  // Toggle seleção de um pedido
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
  
  // Selecionar/desselecionar todos os pedidos válidos
  const toggleSelectAll = () => {
    if (selectedOrders.size === validSelectableOrders.length && validSelectableOrders.length > 0) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(validSelectableOrders.map(o => o.id)));
    }
  };
  
  // Criar remessas em lote para todos os selecionados
  const createBatchShipments = async () => {
    if (selectedOrders.size === 0) {
      toast.error('Selecione pelo menos um pedido');
      return;
    }
    
    setBatchProcessing(true);
    let success = 0;
    let errors = 0;
    const errorMessages: string[] = [];
    
    for (const orderId of selectedOrders) {
      try {
        const order = orders.find(o => o.id === orderId);
        if (!order) continue;
        
        const validation = validateOrderForShipment(order);
        if (!validation.valid) {
          errors++;
          errorMessages.push(`Pedido #${orderId}: ${validation.missingFields.join(', ')}`);
          continue;
        }
        
        const { data, error } = await supabaseTenant.functions.invoke('melhor-envio-labels', {
          body: {
            action: 'create_shipment',
            order_id: orderId,
            tenant_id: supabaseTenant.getTenantId()
          }
        });
        
        if (error || data?.success === false) {
          errors++;
          errorMessages.push(`Pedido #${orderId}: ${data?.error || error?.message || 'Erro desconhecido'}`);
        } else {
          success++;
        }
        
        // Delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (e: any) {
        errors++;
        errorMessages.push(`Pedido #${orderId}: ${e.message}`);
      }
    }
    
    setBatchProcessing(false);
    setSelectedOrders(new Set());
    loadPaidOrders();
    
    if (success > 0) {
      toast.success(`${success} remessa(s) criada(s) com sucesso!`);
    }
    if (errors > 0) {
      console.error('Erros no envio em lote:', errorMessages);
      toast.error(`${errors} erro(s). Verifique o console para detalhes.`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
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

  const getStatusBadge = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) {
      return <Badge className="bg-green-600">Sucesso ({statusCode})</Badge>;
    } else if (statusCode >= 400 && statusCode < 500) {
      return <Badge variant="destructive">Erro Cliente ({statusCode})</Badge>;
    } else if (statusCode >= 500) {
      return <Badge variant="destructive">Erro Servidor ({statusCode})</Badge>;
    }
    return <Badge variant="secondary">{statusCode}</Badge>;
  };

  const getActionLabel = (webhookType: string) => {
    const actions: Record<string, string> = {
      'melhor_envio_create_shipment': 'Criar Remessa',
      'melhor_envio_buy_shipment': 'Comprar Frete',
      'melhor_envio_get_label': 'Gerar Etiqueta',
      'melhor_envio_get_label_generate': 'Gerar Etiqueta (Generate)',
      'melhor_envio_get_label_print': 'Gerar Etiqueta (Print)',
    };
    return actions[webhookType] || webhookType;
  };

  const parseResponse = (response: string) => {
    try {
      return JSON.stringify(JSON.parse(response), null, 2);
    } catch {
      return response;
    }
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8" />
            Etiquetas de Envio
          </h1>
          <p className="text-muted-foreground">
            Gerencie as etiquetas dos pedidos pagos no Melhor Envio
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="etiquetas" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Etiquetas
          </TabsTrigger>
          {isSuperAdmin && (
            <>
              <TabsTrigger value="logs" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Logs de Integração
              </TabsTrigger>
              <TabsTrigger value="config" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configuração Webhook
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="etiquetas" className="space-y-4">
          {/* Busca por nome e filtro por data */}
          <div className="flex flex-col gap-3">
            {/* Campo de busca por nome */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <Input
                  placeholder="Buscar por nome do cliente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchOrders()}
                  className="flex-1"
                />
                <Button onClick={searchOrders} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                </Button>
              </div>
              {isSearchMode && (
                <Button variant="outline" size="sm" onClick={clearSearch}>
                  <X className="h-4 w-4 mr-1" />
                  Limpar busca
                </Button>
              )}
            </div>
            
            {/* Filtro por data e sincronização */}
            <div className="flex flex-wrap items-center gap-2">
              {!isSearchMode && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[200px] justify-start text-left font-normal",
                          !dateFilter && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFilter ? format(dateFilter, "dd/MM/yyyy", { locale: ptBR }) : "Últimos 10 dias"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFilter}
                        onSelect={setDateFilter}
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {dateFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDateFilter(undefined)}
                    >
                      Limpar data
                    </Button>
                  )}
                </>
              )}
              
              {isSearchMode && (
                <Badge variant="secondary" className="text-sm">
                  Mostrando resultados da busca por "{searchQuery}"
                </Badge>
              )}
              
              <div className="flex-1" />
              
              {/* Controles de seleção em lote */}
              {selectableOrders.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    disabled={validSelectableOrders.length === 0}
                  >
                    {selectedOrders.size === validSelectableOrders.length && validSelectableOrders.length > 0 ? (
                      <CheckSquare className="h-4 w-4 mr-2" />
                    ) : (
                      <Square className="h-4 w-4 mr-2" />
                    )}
                    {selectedOrders.size > 0 ? `${selectedOrders.size} selecionado(s)` : 'Selecionar todos'}
                  </Button>
                  
                  <Button
                    size="sm"
                    onClick={createBatchShipments}
                    disabled={selectedOrders.size === 0 || batchProcessing}
                    className="bg-primary"
                  >
                    {batchProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    {batchProcessing ? 'Enviando...' : 'Criar Remessas'}
                  </Button>
                </div>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={syncAllOrdersStatus}
                disabled={syncingAll}
              >
                {syncingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {syncingAll ? 'Sincronizando...' : 'Sincronizar Rastreios'}
              </Button>
            </div>
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
                const validation = validateOrderForShipment(order);
                const canSelect = !order.melhor_envio_shipment_id;
                const isSelected = selectedOrders.has(order.id);
                
                return (
                  <Card key={order.id} className={cn(
                    "overflow-hidden transition-all",
                    isSelected && "ring-2 ring-primary",
                    !validation.valid && canSelect && "border-amber-400"
                  )}>
                    {/* Header com status */}
                    <CardHeader className="bg-muted/30 pb-3">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Checkbox para seleção */}
                            {canSelect && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleOrderSelection(order.id)}
                                disabled={!validation.valid || batchProcessing}
                                className="h-5 w-5"
                              />
                            )}
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
                            {/* Badge de erro de validação */}
                            {!validation.valid && canSelect && (
                              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Dados incompletos
                              </Badge>
                            )}
                          </div>
                          
                          {/* Código de rastreio em destaque */}
                          <div className="flex items-center gap-2 bg-primary/10 px-3 py-2 rounded-lg w-fit">
                            <Truck className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">Rastreio:</span>
                            
                            {editingTrackingOrderId === order.id ? (
                              <>
                                <Input
                                  value={editingTrackingCode}
                                  onChange={(e) => setEditingTrackingCode(e.target.value)}
                                  placeholder="Digite o código"
                                  className="h-7 w-40 text-sm font-mono"
                                  autoFocus
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-green-600 hover:text-green-700"
                                  onClick={() => saveTrackingCode(order.id)}
                                  disabled={savingTracking}
                                >
                                  {savingTracking ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Save className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={cancelEditingTracking}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <code className="bg-background px-2 py-0.5 rounded text-sm font-mono">
                                  {order.melhor_envio_tracking_code || 'Não definido'}
                                </code>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => startEditingTracking(order.id, order.melhor_envio_tracking_code || '')}
                                  title="Editar código de rastreio"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {order.melhor_envio_tracking_code && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() => copyTrackingCode(order.melhor_envio_tracking_code!)}
                                    title="Copiar código"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
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
                          <div className={cn(
                            "bg-muted/30 rounded-lg p-3 space-y-1.5",
                            !order.customer_cpf && canSelect && "border border-amber-400 bg-amber-50/50"
                          )}>
                            <div className="font-medium">{order.customer_name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {formatPhone(order.customer_phone)}
                            </div>
                            
                            {/* CPF com edição inline */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">CPF:</span>
                              {editingCpfOrderId === order.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editingCpf}
                                    onChange={(e) => setEditingCpf(formatCpfInput(e.target.value))}
                                    placeholder="000.000.000-00"
                                    className="h-7 w-32 text-xs font-mono"
                                    maxLength={14}
                                    autoFocus
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-green-600 hover:text-green-700"
                                    onClick={() => saveCpf(order.id, order.customer_phone)}
                                    disabled={savingCpf}
                                  >
                                    {savingCpf ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Save className="h-3 w-3" />
                                    )}
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={cancelEditingCpf}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  {order.customer_cpf ? (
                                    <span className="text-xs font-mono">{formatCpfInput(order.customer_cpf)}</span>
                                  ) : (
                                    <span className="text-xs text-amber-600 font-medium">Não informado</span>
                                  )}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                    onClick={() => startEditingCpf(order.id, order.customer_cpf || '')}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
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
                          <div className={cn(
                            "bg-muted/30 rounded-lg p-3 space-y-1 text-sm",
                            !validation.valid && canSelect && "border border-amber-400 bg-amber-50/50"
                          )}>
                            {validation.valid ? (
                              <>
                                <div>{order.customer_street}, {order.customer_number}</div>
                                {order.customer_complement && (
                                  <div className="text-muted-foreground">{order.customer_complement}</div>
                                )}
                                <div>{order.customer_city} - {order.customer_state}</div>
                                <div className="font-mono text-xs">CEP: {order.customer_cep}</div>
                              </>
                            ) : (
                              <div className="text-amber-700 flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                  <div className="font-medium">Dados de endereço incompletos. Campos faltando:</div>
                                  <div className="text-xs mt-1">{validation.missingFields.join(', ')}</div>
                                </div>
                              </div>
                            )}
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
                                    <span>{item.product?.name || item.product_name || 'Produto'}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {item.product?.code || item.product_code || 'N/A'}
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

                        {order.melhor_envio_shipment_id && !order.melhor_envio_tracking_code && (
                          <Button
                            onClick={() => checkOrderStatus(order.id)}
                            disabled={processingOrders.has(order.id)}
                            variant="outline"
                            size="sm"
                          >
                            {processingOrders.has(order.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Consultar Status
                          </Button>
                        )}

                        {order.melhor_envio_shipment_id && (
                          <>
                            <Button
                              onClick={() => buyShipment(order.id)}
                              disabled={processingOrders.has(order.id)}
                              variant="outline"
                              size="sm"
                            >
                              {processingOrders.has(order.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Truck className="h-4 w-4 mr-2" />
                              )}
                              Comprar Frete
                            </Button>
                            
                            <Button
                              onClick={() => printLabel(order.id)}
                              disabled={processingOrders.has(order.id)}
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
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="logs" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Últimas 100 requisições para o Melhor Envio
              </p>
              <Button variant="outline" size="sm" onClick={loadLogs} disabled={logsLoading}>
                <RefreshCw className={cn("h-4 w-4 mr-2", logsLoading && "animate-spin")} />
                Atualizar
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Lista de Logs */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Histórico de Requisições</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                    {logsLoading ? (
                      <div className="flex items-center justify-center h-32">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : logs.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground">
                        Nenhum log encontrado
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Ação</TableHead>
                            <TableHead>Pedido</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logs.map((log) => (
                            <TableRow 
                              key={log.id} 
                              className={cn(
                                "cursor-pointer hover:bg-muted/50",
                                selectedLog?.id === log.id && "bg-muted"
                              )}
                              onClick={() => setSelectedLog(log)}
                            >
                              <TableCell className="text-xs">
                                {formatDateTime(log.created_at)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {getActionLabel(log.webhook_type)}
                              </TableCell>
                              <TableCell className="text-xs">
                                #{log.payload?.order_id || '-'}
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(log.status_code)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Detalhes do Log Selecionado */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Detalhes da Requisição</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedLog ? (
                    <ScrollArea className="h-[450px]">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">Data/Hora</p>
                          <p className="text-sm">{formatDateTime(selectedLog.created_at)}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">Ação</p>
                          <p className="text-sm">{getActionLabel(selectedLog.webhook_type)}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">Status Code</p>
                          {getStatusBadge(selectedLog.status_code)}
                        </div>

                        {selectedLog.error_message && (
                          <div>
                            <p className="text-sm font-semibold text-destructive mb-1">Erro</p>
                            <pre className="text-xs bg-destructive/10 p-2 rounded overflow-auto max-h-32">
                              {selectedLog.error_message}
                            </pre>
                          </div>
                        )}

                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">Request Payload</p>
                          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                            {JSON.stringify(selectedLog.payload?.request || selectedLog.payload, null, 2)}
                          </pre>
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-muted-foreground mb-1">Response Body</p>
                          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                            {parseResponse(selectedLog.response || '')}
                          </pre>
                        </div>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                      <p>Selecione um log para ver os detalhes</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {isSuperAdmin && (
          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuração do Webhook do Melhor Envio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Por que configurar o webhook?</AlertTitle>
                  <AlertDescription>
                    O webhook permite que o Melhor Envio notifique automaticamente o sistema sobre atualizações de status das etiquetas (postado, em trânsito, entregue, etc.) e envie o código de rastreio para seus clientes via WhatsApp.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">URL do Webhook para cadastrar no Melhor Envio:</h3>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <code className="text-sm flex-1 break-all">
                      https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/melhor-envio-webhook
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText('https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/melhor-envio-webhook');
                        toast.success('URL copiada!');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Passo a passo para configurar:</h3>
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    <li>Acesse o painel do Melhor Envio em <a href="https://melhorenvio.com.br" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">melhorenvio.com.br <ExternalLink className="h-3 w-3" /></a></li>
                    <li>No menu lateral, clique em <strong>"Integrações"</strong> → <strong>"Área Dev"</strong></li>
                    <li>Encontre seu aplicativo na lista (o mesmo usado para gerar as etiquetas)</li>
                    <li>Clique no botão <strong>"Novo Webhook"</strong></li>
                    <li>Cole a URL acima no campo de URL</li>
                    <li>Salve a configuração</li>
                  </ol>
                </div>

                <Alert className="bg-amber-500/10 border-amber-500/50">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <AlertTitle className="text-amber-600">Importante</AlertTitle>
                  <AlertDescription className="text-amber-600">
                    Para que o webhook funcione, as etiquetas precisam ser geradas usando o mesmo aplicativo onde o webhook está configurado. Etiquetas criadas pelo site ou por outro aplicativo não serão notificadas.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Eventos suportados:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline">order.created</Badge>
                      <span>Etiqueta criada</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline">order.released</Badge>
                      <span>Etiqueta paga</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline">order.posted</Badge>
                      <span>Encomenda postada</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline">order.delivered</Badge>
                      <span>Encomenda entregue</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline">order.cancelled</Badge>
                      <span>Etiqueta cancelada</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline">order.undelivered</Badge>
                      <span>Não foi possível entregar</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Quando um evento <strong>order.posted</strong> for recebido com código de rastreio, o sistema enviará automaticamente uma mensagem para o cliente via WhatsApp com o código de rastreio.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Etiquetas;
