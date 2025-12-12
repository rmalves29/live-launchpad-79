import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Loader2, 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Package, 
  Users,
  Calendar,
  Target
} from 'lucide-react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useTenantContext } from '@/contexts/TenantContext';

interface DailySales {
  date: string;
  total_paid: number;
  total_unpaid: number;
  total_orders: number;
  total_products: number;
  ticket_medio: number;
}

interface ProductSales {
  product_name: string;
  product_code: string;
  total_sold: number;
  total_revenue: number;
  avg_price: number;
}

interface PeriodStats {
  total_sales: number;
  total_orders: number;
  total_products: number;
  avg_ticket: number;
}

interface WhatsAppGroupStats {
  group_name: string;
  total_orders: number;
  paid_orders: number;
  unpaid_orders: number;
  total_products: number;
  paid_products: number;
  unpaid_products: number;
  total_revenue: number;
  paid_revenue: number;
  unpaid_revenue: number;
}

interface CustomerStats {
  customer_phone: string;
  customer_name: string;
  total_orders: number;
  paid_orders: number;
  unpaid_orders: number;
  total_products: number;
  total_revenue: number;
  paid_revenue: number;
  unpaid_revenue: number;
  first_order_date: string;
  last_order_date: string;
}

const Relatorios = () => {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [loading, setLoading] = useState(false);
  const [todaySales, setTodaySales] = useState<DailySales | null>(null);
  const [periodStats, setPeriodStats] = useState<{
    daily: PeriodStats;
    monthly: PeriodStats;
    yearly: PeriodStats;
  } | null>(null);
  const [topProducts, setTopProducts] = useState<ProductSales[]>([]);
  const [whatsappGroupStats, setWhatsappGroupStats] = useState<WhatsAppGroupStats[]>([]);
  const [topCustomers, setTopCustomers] = useState<CustomerStats[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'month' | 'year' | 'custom'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [salesFilter, setSalesFilter] = useState<'today' | 'month' | 'year' | 'custom' | 'all'>('all');
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  
  // Filtros específicos para Grupos WhatsApp
  const [whatsappFilter, setWhatsappFilter] = useState<'today' | 'month' | 'year' | 'custom' | 'all'>('all');
  const [whatsappStartDate, setWhatsappStartDate] = useState('');
  const [whatsappEndDate, setWhatsappEndDate] = useState('');

  // Filtros específicos para Clientes
  const [customersFilter, setCustomersFilter] = useState<'today' | 'month' | 'year' | 'custom' | 'all'>('all');
  const [customersStartDate, setCustomersStartDate] = useState('');
  const [customersEndDate, setCustomersEndDate] = useState('');
  
  // Cache de nomes de grupos do WhatsApp
  const [groupNamesCache, setGroupNamesCache] = useState<Map<string, string>>(new Map());
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const loadTodaySales = async () => {
    try {
      let dateFilter = '';
      let endDateFilter = '';
      
      switch (salesFilter) {
        case 'today':
          dateFilter = new Date().toISOString().split('T')[0];
          break;
        case 'month':
          const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
          dateFilter = startOfMonth.toISOString().split('T')[0];
          break;
        case 'year':
          const startOfYear = new Date(new Date().getFullYear(), 0, 1);
          dateFilter = startOfYear.toISOString().split('T')[0];
          break;
        case 'custom':
          if (!salesStartDate || !salesEndDate) return;
          dateFilter = salesStartDate;
          endDateFilter = salesEndDate;
          break;
        case 'all':
          // No date filter
          break;
      }
      
      let query = supabaseTenant
        .from('orders')
        .select('total_amount, is_paid, cart_id');

      if (salesFilter === 'custom' && dateFilter && endDateFilter) {
        query = query
          .gte('created_at', `${dateFilter}T00:00:00`)
          .lte('created_at', `${endDateFilter}T23:59:59`);
      } else if (dateFilter) {
        query = query.gte('created_at', `${dateFilter}T00:00:00`);
      }

      const { data: orders, error } = await query;

      if (error) throw error;

      const totalPaid = orders?.filter(o => o.is_paid).reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalUnpaid = orders?.filter(o => !o.is_paid).reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalOrders = orders?.length || 0;
      
      // Get products count for these orders
      const cartIds = orders?.map(o => o.cart_id).filter(Boolean) || [];
      let totalProducts = 0;
      
      if (cartIds.length > 0) {
        const { data: cartItems } = await supabaseTenant
          .from('cart_items')
          .select('qty')
          .in('cart_id', cartIds);
        
        totalProducts = cartItems?.reduce((sum, item) => sum + item.qty, 0) || 0;
      }
      
      const ticketMedio = totalOrders > 0 ? (totalPaid + totalUnpaid) / totalOrders : 0;

      setTodaySales({
        date: dateFilter || 'all',
        total_paid: totalPaid,
        total_unpaid: totalUnpaid,
        total_orders: totalOrders,
        total_products: totalProducts,
        ticket_medio: ticketMedio
      });
    } catch (error) {
      console.error('Error loading today sales:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar vendas',
        variant: 'destructive'
      });
    }
  };

  const loadPeriodStats = async () => {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfYear = new Date(today.getFullYear(), 0, 1);

      // Vendas do dia - apenas orders
      const dailyOrders = await supabaseTenant
        .from('orders')
        .select('total_amount, cart_id')
        .gte('created_at', today.toISOString().split('T')[0] + 'T00:00:00')
        .lt('created_at', today.toISOString().split('T')[0] + 'T23:59:59');

      // Vendas do mês
      const monthlyOrders = await supabaseTenant
        .from('orders')
        .select('total_amount, cart_id')
        .gte('created_at', startOfMonth.toISOString());

      // Vendas do ano
      const yearlyOrders = await supabaseTenant
        .from('orders')
        .select('total_amount, cart_id')
        .gte('created_at', startOfYear.toISOString());

      // Helper function to get products count for given cart IDs
      const getProductsCount = async (cartIds: number[]) => {
        if (cartIds.length === 0) return [];
        
        const { data } = await supabaseTenant
          .from('cart_items')
          .select('qty')
          .in('cart_id', cartIds);
        
        return data || [];
      };

      // Get cart IDs for each period
      const dailyCartIds = (dailyOrders.data || []).map(o => o.cart_id).filter(Boolean);
      const monthlyCartIds = (monthlyOrders.data || []).map(o => o.cart_id).filter(Boolean);
      const yearlyCartIds = (yearlyOrders.data || []).map(o => o.cart_id).filter(Boolean);

      // Get products for each period
      const [dailyProducts, monthlyProducts, yearlyProducts] = await Promise.all([
        getProductsCount(dailyCartIds),
        getProductsCount(monthlyCartIds),
        getProductsCount(yearlyCartIds)
      ]);

      const calculateStats = (orders: any[], products: any[]): PeriodStats => {
        const totalSales = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
        const totalOrders = orders.length;
        const totalProducts = products.reduce((sum, item) => sum + item.qty, 0);
        const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

        return {
          total_sales: totalSales,
          total_orders: totalOrders,
          total_products: totalProducts,
          avg_ticket: avgTicket
        };
      };

      setPeriodStats({
        daily: calculateStats(dailyOrders.data || [], dailyProducts),
        monthly: calculateStats(monthlyOrders.data || [], monthlyProducts),
        yearly: calculateStats(yearlyOrders.data || [], yearlyProducts)
      });
    } catch (error) {
      console.error('Error loading period stats:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar estatísticas do período',
        variant: 'destructive'
      });
    }
  };

  const loadTopProducts = async () => {
    try {
      let dateFilter = '';
      let endDateFilter = '';
      const today = new Date();
      
      switch (selectedPeriod) {
        case 'today':
          dateFilter = today.toISOString().split('T')[0];
          break;
        case 'month':
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          dateFilter = startOfMonth.toISOString().split('T')[0];
          break;
        case 'year':
          const startOfYear = new Date(today.getFullYear(), 0, 1);
          dateFilter = startOfYear.toISOString().split('T')[0];
          break;
        case 'custom':
          if (!startDate || !endDate) return;
          dateFilter = startDate;
          endDateFilter = endDate;
          break;
      }

      // First, get orders in the date range
      let ordersQuery = supabaseTenant
        .from('orders')
        .select('id, cart_id');

      if (selectedPeriod === 'custom' && dateFilter && endDateFilter) {
        ordersQuery = ordersQuery
          .gte('created_at', `${dateFilter}T00:00:00`)
          .lte('created_at', `${endDateFilter}T23:59:59`);
      } else if (dateFilter) {
        ordersQuery = ordersQuery.gte('created_at', `${dateFilter}T00:00:00`);
      }

      const { data: ordersData, error: ordersError } = await ordersQuery;
      
      if (ordersError) throw ordersError;

      if (!ordersData || ordersData.length === 0) {
        setTopProducts([]);
        return;
      }

      // Get cart IDs from orders
      const cartIds = ordersData.map(order => order.cart_id).filter(Boolean);

      if (cartIds.length === 0) {
        setTopProducts([]);
        return;
      }

      // Now get cart items for these carts
      const { data: cartItemsData, error: cartItemsError } = await supabaseTenant
        .from('cart_items')
        .select(`
          qty,
          unit_price,
          products(name, code)
        `)
        .in('cart_id', cartIds);

      if (cartItemsError) throw cartItemsError;

      // Agrupar por produto
      const productMap = new Map<string, ProductSales>();

      cartItemsData?.forEach(item => {
        const productName = item.products?.name || 'Produto removido';
        const productCode = item.products?.code || 'N/A';
        const key = `${productName}-${productCode}`;

        if (productMap.has(key)) {
          const existing = productMap.get(key)!;
          existing.total_sold += item.qty;
          existing.total_revenue += item.qty * Number(item.unit_price);
        } else {
          productMap.set(key, {
            product_name: productName,
            product_code: productCode,
            total_sold: item.qty,
            total_revenue: item.qty * Number(item.unit_price),
            avg_price: Number(item.unit_price)
          });
        }
      });

      // Converter para array e ordenar por quantidade vendida
      const productsArray = Array.from(productMap.values())
        .map(product => ({
          ...product,
          avg_price: product.total_revenue / product.total_sold
        }))
        .sort((a, b) => b.total_sold - a.total_sold)
        .slice(0, 10); // Top 10

      setTopProducts(productsArray);
    } catch (error) {
      console.error('Error loading top products:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar produtos mais vendidos',
        variant: 'destructive'
      });
    }
  };

  const loadWhatsAppGroupStats = async () => {
    try {
      // Buscar lista de grupos via Z-API para obter os nomes reais
      let zapiGroupNames = new Map<string, string>();
      
      if (tenantId) {
        try {
          const response = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
            body: { action: 'list-groups', tenant_id: tenantId }
          });
          
          if (response.data?.groups) {
            for (const group of response.data.groups) {
              if (group.id && group.name) {
                zapiGroupNames.set(group.id, group.name);
              }
            }
            console.log('📱 Grupos Z-API carregados:', zapiGroupNames.size);
          }
        } catch (zapiError) {
          console.warn('⚠️ Não foi possível carregar nomes dos grupos via Z-API:', zapiError);
        }
      }
      
      // Aplicar filtros de data
      let dateFilter = '';
      let endDateFilter = '';
      
      switch (whatsappFilter) {
        case 'today':
          dateFilter = new Date().toISOString().split('T')[0];
          break;
        case 'month':
          const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
          dateFilter = startOfMonth.toISOString().split('T')[0];
          break;
        case 'year':
          const startOfYear = new Date(new Date().getFullYear(), 0, 1);
          dateFilter = startOfYear.toISOString().split('T')[0];
          break;
        case 'custom':
          if (!whatsappStartDate || !whatsappEndDate) return;
          dateFilter = whatsappStartDate;
          endDateFilter = whatsappEndDate;
          break;
        case 'all':
          // No date filter
          break;
      }

      // Buscar pedidos com informação de grupo do carrinho
      let query = supabaseTenant
        .from('orders')
        .select(`
          id, 
          total_amount, 
          is_paid, 
          cart_id, 
          customer_phone,
          whatsapp_group_name,
          carts!inner(whatsapp_group_name)
        `);

      if (whatsappFilter === 'custom' && dateFilter && endDateFilter) {
        query = query
          .gte('created_at', `${dateFilter}T00:00:00`)
          .lte('created_at', `${endDateFilter}T23:59:59`);
      } else if (dateFilter) {
        query = query.gte('created_at', `${dateFilter}T00:00:00`);
      }

      const { data: orders, error } = await query;

      if (error) throw error;

      console.log('📦 Orders encontrados:', orders?.length);

      // Criar mapa para agrupar estatísticas por grupo
      const groupMap = new Map<string, WhatsAppGroupStats>();

      // Coletar cart items para contar produtos
      const cartIds = orders?.map(o => o.cart_id).filter(Boolean) as number[];
      let cartItemsMap = new Map<number, any[]>();
      if (cartIds.length > 0) {
        const { data: cartItems } = await supabaseTenant
          .from('cart_items')
          .select('cart_id, qty')
          .in('cart_id', cartIds);
        cartItems?.forEach(item => {
          if (!cartItemsMap.has(item.cart_id)) cartItemsMap.set(item.cart_id, []);
          cartItemsMap.get(item.cart_id)!.push(item);
        });
      }

      // Processar cada pedido e agrupar por grupo WhatsApp
      orders?.forEach(order => {
        // Determinar código do grupo
        let groupCode = order.whatsapp_group_name || order.carts?.whatsapp_group_name || 'Sem Grupo';

        // Obter nome amigável do grupo: preferir Z-API, caso contrário fallback
        let groupName = 'Sem Grupo';
        if (groupCode && groupCode !== 'Sem Grupo') {
          if (zapiGroupNames.has(groupCode)) {
            // Nome obtido via Z-API
            groupName = zapiGroupNames.get(groupCode)!;
          } else if (groupCode.includes('@g.us')) {
            // Fallback: usar últimos 8 dígitos do JID
            groupName = `Grupo ${groupCode.split('@')[0].slice(-8)}`;
          } else if (groupCode.includes('-')) {
            groupName = `Grupo ${groupCode.slice(-8)}`;
          } else {
            groupName = groupCode;
          }
        }
        
        console.log(`📞 Pedido ${order.id} - Grupo Code: ${groupCode} - Nome: ${groupName}`);
        
        const amount = Number(order.total_amount);
        const items = cartItemsMap.get(order.cart_id) || [];
        const productsCount = items.reduce((sum, it) => sum + it.qty, 0);

        // Inicializar grupo se não existir
        if (!groupMap.has(groupName)) {
          groupMap.set(groupName, {
            group_name: groupName,
            total_orders: 0,
            paid_orders: 0,
            unpaid_orders: 0,
            total_products: 0,
            paid_products: 0,
            unpaid_products: 0,
            total_revenue: 0,
            paid_revenue: 0,
            unpaid_revenue: 0
          });
        }

        const g = groupMap.get(groupName)!;
        g.total_orders += 1;
        g.total_revenue += amount;
        g.total_products += productsCount;
        
        if (order.is_paid) {
          g.paid_orders += 1;
          g.paid_revenue += amount;
          g.paid_products += productsCount;
        } else {
          g.unpaid_orders += 1;
          g.unpaid_revenue += amount;
          g.unpaid_products += productsCount;
        }
      });

      // Converter para array e ordenar por total de pedidos
      const groupsArray = Array.from(groupMap.values()).sort((a,b) => b.total_orders - a.total_orders);
      
      console.log('📊 Estatísticas finais por grupo:', groupsArray);
      setWhatsappGroupStats(groupsArray);
    } catch (error) {
      console.error('Error loading WhatsApp group stats:', error);
      toast({ title: 'Erro', description: 'Erro ao carregar estatísticas por grupo de WhatsApp', variant: 'destructive' });
    }
  };

  const loadTopCustomers = async () => {
    try {
      let dateFilter = '';
      let endDateFilter = '';
      
      switch (customersFilter) {
        case 'today':
          dateFilter = new Date().toISOString().split('T')[0];
          break;
        case 'month':
          const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
          dateFilter = startOfMonth.toISOString().split('T')[0];
          break;
        case 'year':
          const startOfYear = new Date(new Date().getFullYear(), 0, 1);
          dateFilter = startOfYear.toISOString().split('T')[0];
          break;
        case 'custom':
          if (!customersStartDate || !customersEndDate) return;
          dateFilter = customersStartDate;
          endDateFilter = customersEndDate;
          break;
        case 'all':
          // No date filter
          break;
      }

      // Buscar pedidos com filtro de data
      let query = supabaseTenant
        .from('orders')
        .select(`
          id, 
          customer_phone,
          customer_name,
          total_amount, 
          is_paid, 
          cart_id,
          created_at
        `);

      if (customersFilter === 'custom' && dateFilter && endDateFilter) {
        query = query
          .gte('created_at', `${dateFilter}T00:00:00`)
          .lte('created_at', `${endDateFilter}T23:59:59`);
      } else if (dateFilter) {
        query = query.gte('created_at', `${dateFilter}T00:00:00`);
      }

      const { data: orders, error } = await query;

      if (error) throw error;

      console.log('📦 Orders encontrados para clientes:', orders?.length);

      // Buscar dados dos clientes cadastrados
      const phones = [...new Set(orders?.map(o => o.customer_phone).filter(Boolean))] as string[];
      const { data: customers } = await supabaseTenant
        .from('customers')
        .select('phone, name')
        .in('phone', phones);
      
      // Criar mapa de telefone -> nome cadastrado
      const customerNamesMap = new Map<string, string>();
      customers?.forEach(customer => {
        customerNamesMap.set(customer.phone, customer.name);
      });

      // Criar mapa para agrupar estatísticas por cliente
      const customerMap = new Map<string, CustomerStats>();

      // Coletar cart items para contar produtos
      const cartIds = orders?.map(o => o.cart_id).filter(Boolean) as number[];
      let cartItemsMap = new Map<number, any[]>();
      if (cartIds.length > 0) {
        const { data: cartItems } = await supabaseTenant
          .from('cart_items')
          .select('cart_id, qty')
          .in('cart_id', cartIds);
        cartItems?.forEach(item => {
          if (!cartItemsMap.has(item.cart_id)) cartItemsMap.set(item.cart_id, []);
          cartItemsMap.get(item.cart_id)!.push(item);
        });
      }

      // Processar cada pedido e agrupar por cliente
      orders?.forEach(order => {
        const phone = order.customer_phone || 'Sem telefone';
        const amount = Number(order.total_amount);
        const items = cartItemsMap.get(order.cart_id) || [];
        const productsCount = items.reduce((sum, it) => sum + it.qty, 0);

        // Buscar nome do cadastro se existir, caso contrário usar telefone
        let displayName = phone;
        const registeredName = customerNamesMap.get(phone);
        if (registeredName) {
          // Pegar apenas o primeiro nome
          displayName = registeredName.split(' ')[0];
        }

        // Inicializar cliente se não existir
        if (!customerMap.has(phone)) {
          customerMap.set(phone, {
            customer_phone: phone,
            customer_name: displayName,
            total_orders: 0,
            paid_orders: 0,
            unpaid_orders: 0,
            total_products: 0,
            total_revenue: 0,
            paid_revenue: 0,
            unpaid_revenue: 0,
            first_order_date: order.created_at,
            last_order_date: order.created_at
          });
        }

        const customer = customerMap.get(phone)!;
        customer.total_orders += 1;
        customer.total_revenue += amount;
        customer.total_products += productsCount;
        
        // Atualizar datas
        if (order.created_at < customer.first_order_date) {
          customer.first_order_date = order.created_at;
        }
        if (order.created_at > customer.last_order_date) {
          customer.last_order_date = order.created_at;
        }
        
        if (order.is_paid) {
          customer.paid_orders += 1;
          customer.paid_revenue += amount;
        } else {
          customer.unpaid_orders += 1;
          customer.unpaid_revenue += amount;
        }
      });

      // Converter para array e ordenar por total de pedidos (clientes com mais compras)
      const customersArray = Array.from(customerMap.values())
        .sort((a, b) => b.total_orders - a.total_orders)
        .slice(0, 50); // Top 50 clientes
      
      console.log('📊 Top clientes:', customersArray);
      setTopCustomers(customersArray);
    } catch (error) {
      console.error('Error loading top customers:', error);
      toast({ 
        title: 'Erro', 
        description: 'Erro ao carregar clientes com mais compras', 
        variant: 'destructive' 
      });
    }
  };

  const loadAllReports = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadTodaySales(),
        loadPeriodStats(),
        loadTopProducts(),
        loadWhatsAppGroupStats(),
        loadTopCustomers()
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadAllReports();
    }
  }, [tenantId]);

  useEffect(() => {
    loadTopProducts();
  }, [selectedPeriod, startDate, endDate]);

  useEffect(() => {
    loadTodaySales();
  }, [salesFilter, salesStartDate, salesEndDate]);

  useEffect(() => {
    loadWhatsAppGroupStats();
  }, [whatsappFilter, whatsappStartDate, whatsappEndDate]);

  useEffect(() => {
    loadTopCustomers();
  }, [customersFilter, customersStartDate, customersEndDate]);

  return (
    <div className="container mx-auto py-6 max-w-7xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center">
          <BarChart3 className="h-8 w-8 mr-3 text-primary" />
          Relatórios
        </h1>
        <Button onClick={loadAllReports} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="products">Produtos Mais Vendidos</TabsTrigger>
          <TabsTrigger value="customers">Clientes com Mais Compras</TabsTrigger>
          <TabsTrigger value="whatsapp">Grupos WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Vendas de Hoje */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Vendas por Período
                </span>
                <div className="flex items-center space-x-4">
                  <Select value={salesFilter} onValueChange={(value: any) => setSalesFilter(value)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Geral</SelectItem>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="month">Este Mês</SelectItem>
                      <SelectItem value="year">Este Ano</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {salesFilter === 'custom' && (
                    <div className="flex items-center space-x-2">
                      <Input
                        type="date"
                        value={salesStartDate}
                        onChange={(e) => setSalesStartDate(e.target.value)}
                        className="w-36"
                      />
                      <span>até</span>
                      <Input
                        type="date"
                        value={salesEndDate}
                        onChange={(e) => setSalesEndDate(e.target.value)}
                        className="w-36"
                      />
                    </div>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Carregando...</span>
                </div>
              ) : todaySales ? (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(todaySales.total_paid)}
                    </div>
                    <div className="text-sm text-muted-foreground">Vendas Pagas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {formatCurrency(todaySales.total_unpaid)}
                    </div>
                    <div className="text-sm text-muted-foreground">Vendas Pendentes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {todaySales.total_orders}
                    </div>
                    <div className="text-sm text-muted-foreground">Total de Pedidos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {todaySales.total_products}
                    </div>
                    <div className="text-sm text-muted-foreground">Produtos Vendidos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatCurrency(todaySales.ticket_medio)}
                    </div>
                    <div className="text-sm text-muted-foreground">Ticket Médio</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum dado disponível para hoje
                </div>
              )}
            </CardContent>
          </Card>

          {/* Estatísticas Históricas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Hoje
                </CardTitle>
              </CardHeader>  
              <CardContent>
                {periodStats && (
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm">Vendas:</span>
                      <span className="font-semibold">{formatCurrency(periodStats.daily.total_sales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Pedidos:</span>
                      <span className="font-semibold">{periodStats.daily.total_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Produtos:</span>
                      <span className="font-semibold">{periodStats.daily.total_products}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Ticket Médio:</span>
                      <span className="font-semibold">{formatCurrency(periodStats.daily.avg_ticket)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <DollarSign className="h-5 w-5 mr-2" />
                  Este Mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                {periodStats && (
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm">Vendas:</span>
                      <span className="font-semibold">{formatCurrency(periodStats.monthly.total_sales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Pedidos:</span>
                      <span className="font-semibold">{periodStats.monthly.total_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Produtos:</span>
                      <span className="font-semibold">{periodStats.monthly.total_products}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Ticket Médio:</span>
                      <span className="font-semibold">{formatCurrency(periodStats.monthly.avg_ticket)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Target className="h-5 w-5 mr-2" />
                  Este Ano
                </CardTitle>
              </CardHeader>
              <CardContent>
                {periodStats && (
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm">Vendas:</span>
                      <span className="font-semibold">{formatCurrency(periodStats.yearly.total_sales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Pedidos:</span>
                      <span className="font-semibold">{periodStats.yearly.total_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Produtos:</span>
                      <span className="font-semibold">{periodStats.yearly.total_products}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Ticket Médio:</span>
                      <span className="font-semibold">{formatCurrency(periodStats.yearly.avg_ticket)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Produtos Mais Vendidos
                </span>
                <div className="flex items-center space-x-4">
                  <Select value={selectedPeriod} onValueChange={(value: any) => setSelectedPeriod(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="month">Este Mês</SelectItem>
                      <SelectItem value="year">Este Ano</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedPeriod === 'custom' && (
                    <div className="flex items-center space-x-2">
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-36"
                      />
                      <span>até</span>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-36"
                      />
                    </div>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Carregando...</span>
                </div>
              ) : topProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum produto vendido no período selecionado
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Posição</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Qtd Vendida</TableHead>
                        <TableHead className="text-right">Receita Total</TableHead>
                        <TableHead className="text-right">Preço Médio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.map((product, index) => (
                        <TableRow key={`${product.product_name}-${product.product_code}`}>
                          <TableCell>
                            <Badge variant={index < 3 ? "default" : "secondary"}>
                              {index + 1}º
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{product.product_name}</TableCell>
                          <TableCell className="font-mono text-sm">{product.product_code}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {product.total_sold}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(product.total_revenue)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.avg_price)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Clientes com Mais Compras
                </span>
                <div className="flex items-center space-x-4">
                  <Select value={customersFilter} onValueChange={(value: any) => setCustomersFilter(value)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Geral</SelectItem>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="month">Este Mês</SelectItem>
                      <SelectItem value="year">Este Ano</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {customersFilter === 'custom' && (
                    <div className="flex items-center space-x-2">
                      <Input
                        type="date"
                        value={customersStartDate}
                        onChange={(e) => setCustomersStartDate(e.target.value)}
                        className="w-36"
                      />
                      <span>até</span>
                      <Input
                        type="date"
                        value={customersEndDate}
                        onChange={(e) => setCustomersEndDate(e.target.value)}
                        className="w-36"
                      />
                    </div>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Carregando...</span>
                </div>
              ) : topCustomers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum cliente encontrado no período selecionado
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Posição</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead className="text-center">Total Pedidos</TableHead>
                        <TableHead className="text-center">Pedidos Pagos</TableHead>
                        <TableHead className="text-center">Total Produtos</TableHead>
                        <TableHead className="text-right">Receita Total</TableHead>
                        <TableHead className="text-right">Receita Paga</TableHead>
                        <TableHead className="text-right">Receita Pendente</TableHead>
                        <TableHead className="text-center">Taxa Pagamento</TableHead>
                        <TableHead>Primeira Compra</TableHead>
                        <TableHead>Última Compra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topCustomers.map((customer, index) => {
                        const conversionRate = customer.total_orders > 0 
                          ? (customer.paid_orders / customer.total_orders) * 100 
                          : 0;
                        
                        return (
                          <TableRow key={customer.customer_phone}>
                            <TableCell>
                              <Badge variant={index < 3 ? "default" : "secondary"}>
                                {index + 1}º
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {customer.customer_name}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {customer.customer_phone}
                            </TableCell>
                            <TableCell className="text-center font-semibold">
                              {customer.total_orders}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                {customer.paid_orders}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-semibold text-orange-600">
                              {customer.total_products}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(customer.total_revenue)}
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-semibold">
                              {formatCurrency(customer.paid_revenue)}
                            </TableCell>
                            <TableCell className="text-right text-yellow-600 font-semibold">
                              {formatCurrency(customer.unpaid_revenue)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge 
                                variant={conversionRate >= 90 ? "default" : conversionRate >= 50 ? "secondary" : "outline"}
                                className={
                                  conversionRate >= 90 ? "bg-green-100 text-green-800" :
                                  conversionRate >= 50 ? "bg-yellow-100 text-yellow-800" :
                                  "bg-red-100 text-red-800"
                                }
                              >
                                {conversionRate.toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(customer.first_order_date)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(customer.last_order_date)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Relatório por Grupos de WhatsApp
                </span>
                <div className="flex items-center space-x-4">
                  <Select value={whatsappFilter} onValueChange={(value: any) => setWhatsappFilter(value)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Geral</SelectItem>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="month">Este Mês</SelectItem>
                      <SelectItem value="year">Este Ano</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {whatsappFilter === 'custom' && (
                    <div className="flex items-center space-x-2">
                      <Input
                        type="date"
                        value={whatsappStartDate}
                        onChange={(e) => setWhatsappStartDate(e.target.value)}
                        className="w-36"
                      />
                      <span>até</span>
                      <Input
                        type="date"
                        value={whatsappEndDate}
                        onChange={(e) => setWhatsappEndDate(e.target.value)}
                        className="w-36"
                      />
                    </div>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Carregando...</span>
                </div>
              ) : whatsappGroupStats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum dado disponível por grupo de WhatsApp
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grupo</TableHead>
                        <TableHead className="text-center">Total Pedidos</TableHead>
                        <TableHead className="text-center">Pedidos Pagos</TableHead>
                        <TableHead className="text-center">Total Produtos</TableHead>
                        <TableHead className="text-center">Produtos Pagos</TableHead>
                        <TableHead className="text-center">Produtos Pendentes</TableHead>
                        <TableHead className="text-right">Receita Paga</TableHead>
                        <TableHead className="text-right">Receita Pendente</TableHead>
                        <TableHead className="text-right">Receita Total</TableHead>
                        <TableHead className="text-center">Taxa Conversão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {whatsappGroupStats.map((group, index) => (
                        <TableRow key={group.group_name}>
                          <TableCell className="font-medium">{group.group_name}</TableCell>
                          <TableCell className="text-center font-semibold">
                            {group.total_orders}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              {group.paid_orders}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-semibold">
                            {group.total_products}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              {group.paid_products}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              {group.unpaid_products}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(group.paid_revenue)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-yellow-600">
                            {formatCurrency(group.unpaid_revenue)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(group.total_revenue)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant={group.paid_orders / group.total_orders >= 0.5 ? "default" : "secondary"}
                              className={group.paid_orders / group.total_orders >= 0.5 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                            >
                              {((group.paid_orders / group.total_orders) * 100).toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Relatorios;
