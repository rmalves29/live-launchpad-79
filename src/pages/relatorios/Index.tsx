import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { formatPhoneForDisplay } from '@/lib/phone-utils';
import { formatBrasiliaDate, getBrasiliaDateISO, getBrasiliaDate, toBrasiliaDateISO, getBrasiliaDayBoundsISO } from '@/lib/date-utils';

const AgenteIAContent = lazy(() => import('@/pages/agente-ia/Index'));

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
  paid_sales: number;
  unpaid_sales: number;
  total_orders: number;
  paid_orders: number;
  unpaid_orders: number;
  total_products: number;
  paid_products: number;
  unpaid_products: number;
  avg_ticket: number;
  paid_avg_ticket: number;
  unpaid_avg_ticket: number;
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
  last_paid_order_date?: string | null;
  score?: number;
}

const Relatorios = () => {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);
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
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'yesterday' | 'month' | 'year' | 'custom'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [salesFilter, setSalesFilter] = useState<'today' | 'yesterday' | 'month' | 'year' | 'custom' | 'all'>('all');
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  
  // Filtro global de tipo de venda (BAZAR/LIVE/TODOS)
  const [saleTypeFilter, setSaleTypeFilter] = useState<'ALL' | 'BAZAR' | 'LIVE'>('ALL');
  
  // Filtros específicos para Grupos WhatsApp
  const [whatsappFilter, setWhatsappFilter] = useState<'today' | 'yesterday' | 'month' | 'year' | 'custom' | 'all'>('all');
  const [whatsappStartDate, setWhatsappStartDate] = useState('');
  const [whatsappEndDate, setWhatsappEndDate] = useState('');

  // Filtros específicos para Clientes
  const [customersFilter, setCustomersFilter] = useState<'today' | 'yesterday' | 'month' | 'year' | 'custom' | 'all'>('all');
  const [customersStartDate, setCustomersStartDate] = useState('');
  const [customersEndDate, setCustomersEndDate] = useState('');
  
  // Cache de nomes de grupos do WhatsApp
  const [groupNamesCache, setGroupNamesCache] = useState<Map<string, string>>(new Map());

  // ============ NOVOS STATES (REDESIGN) ============
  type GlobalPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'year' | 'custom';
  const [globalPeriod, setGlobalPeriod] = useState<GlobalPeriod>('30d');
  const [globalStart, setGlobalStart] = useState('');
  const [globalEnd, setGlobalEnd] = useState('');
  const [metricMode, setMetricMode] = useState<'value' | 'qty'>('value');
  const [tableTab, setTableTab] = useState<'produtos' | 'clientes' | 'grupos'>('produtos');
  const [dailySeries, setDailySeries] = useState<Array<{ date: string; paid: number; unpaid: number; total: number; orders: number }>>([]);
  const [prodSort, setProdSort] = useState<'qty' | 'revenue'>('qty');
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return formatBrasiliaDate(dateString);
  };

  // Helper: pagina queries do PostgREST em blocos de 1000 para superar o limite default.
  // Sem isso, qualquer empresa com >1000 pedidos no período tem números truncados.
  const fetchAllPaginated = async <T,>(buildQuery: () => any): Promise<T[]> => {
    const PAGE = 1000;
    let from = 0;
    const all: T[] = [];
    // Hard cap de segurança: 200k linhas
    while (from < 200000) {
      const { data, error } = await buildQuery().range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as T[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const loadTodaySales = async () => {
    try {
      let dateFilter = '';
      let endDateFilter = '';
      
      switch (salesFilter) {
        case 'today':
          dateFilter = getBrasiliaDateISO();
          break;
        case 'yesterday':
          const yesterdayDate = getBrasiliaDate();
          yesterdayDate.setDate(yesterdayDate.getDate() - 1);
          dateFilter = toBrasiliaDateISO(yesterdayDate);
          endDateFilter = dateFilter;
          break;
        case 'month':
          const now = getBrasiliaDate();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFilter = toBrasiliaDateISO(startOfMonth);
          break;
        case 'year':
          const nowYear = getBrasiliaDate();
          const startOfYear = new Date(nowYear.getFullYear(), 0, 1);
          dateFilter = toBrasiliaDateISO(startOfYear);
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
      
      const buildQuery = () => {
        let query = supabaseTenant
          .from('orders')
          .select('id, total_amount, is_paid, cart_id')
          .or('is_cancelled.is.null,is_cancelled.eq.false');

        if ((salesFilter === 'custom' || salesFilter === 'yesterday') && dateFilter && endDateFilter) {
          const { start } = getBrasiliaDayBoundsISO(dateFilter);
          const { end } = getBrasiliaDayBoundsISO(endDateFilter);
          query = query
            .gte('created_at', start)
            .lte('created_at', end);
        } else if (dateFilter) {
          const { start } = getBrasiliaDayBoundsISO(dateFilter);
          query = query.gte('created_at', start);
        }
        return query;
      };

      const orders = await fetchAllPaginated<any>(buildQuery);

      // Se temos filtro de tipo de venda, precisamos filtrar as orders que têm produtos do tipo selecionado
      let filteredOrders = orders || [];
      
      if (saleTypeFilter !== 'ALL' && orders && orders.length > 0) {
        const cartIds = orders.map(o => o.cart_id).filter(Boolean);
        
        if (cartIds.length > 0) {
          // Buscar cart_items com product_code (armazenado diretamente)
          const { data: cartItems } = await supabaseTenant
            .from('cart_items')
            .select('cart_id, product_code')
            .in('cart_id', cartIds);
          
          // Coletar todos os product_codes únicos
          const productCodes = [...new Set(cartItems?.map(ci => ci.product_code).filter(Boolean) || [])];
          
          // Buscar products por código para obter sale_type
          let productSaleTypes: Record<string, string> = {};
          if (productCodes.length > 0) {
            const { data: products } = await supabaseTenant
              .from('products')
              .select('code, sale_type')
              .in('code', productCodes);
            
            products?.forEach(p => {
              productSaleTypes[p.code] = p.sale_type;
            });
          }
          
          // Filtrar cart_ids que têm produtos do tipo selecionado
          const validCartIds = new Set<number>();
          cartItems?.forEach(item => {
            const productSaleType = item.product_code ? productSaleTypes[item.product_code] : null;
            if (productSaleType === saleTypeFilter || productSaleType === 'AMBOS') {
              validCartIds.add(item.cart_id);
            }
          });
          
          // Filtrar orders pelos cart_ids válidos
          filteredOrders = orders.filter(o => o.cart_id && validCartIds.has(o.cart_id));
        }
      }

      const totalPaid = filteredOrders.filter(o => o.is_paid).reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalUnpaid = filteredOrders.filter(o => !o.is_paid).reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalOrders = filteredOrders.length || 0;
      
      // Get products count for these orders
      const cartIds = filteredOrders.map(o => o.cart_id).filter(Boolean) || [];
      let totalProducts = 0;
      
      if (cartIds.length > 0) {
        const { data: cartItems } = await supabaseTenant
          .from('cart_items')
          .select('qty, product_code')
          .in('cart_id', cartIds);
        
        // Filtrar por tipo de venda se necessário
        if (saleTypeFilter === 'ALL') {
          totalProducts = cartItems?.reduce((sum, item) => sum + item.qty, 0) || 0;
        } else {
          // Buscar sale_type pelos códigos
          const productCodes = [...new Set(cartItems?.map(ci => ci.product_code).filter(Boolean) || [])];
          let productSaleTypes: Record<string, string> = {};
          
          if (productCodes.length > 0) {
            const { data: products } = await supabaseTenant
              .from('products')
              .select('code, sale_type')
              .in('code', productCodes);
            
            products?.forEach(p => {
              productSaleTypes[p.code] = p.sale_type;
            });
          }
          
          const filteredItems = cartItems?.filter(item => {
            const productSaleType = item.product_code ? productSaleTypes[item.product_code] : null;
            return productSaleType === saleTypeFilter || productSaleType === 'AMBOS';
          });
          
          totalProducts = filteredItems?.reduce((sum, item) => sum + item.qty, 0) || 0;
        }
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
    } catch (error: any) {
      console.error('Error loading today sales:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar vendas',
        variant: 'destructive'
      });
    }
  };

  const loadPeriodStats = async () => {
    try {
      const todayBrasilia = getBrasiliaDate();
      const todayStr = getBrasiliaDateISO();
      const tomorrowDate = new Date(todayBrasilia);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = toBrasiliaDateISO(tomorrowDate);
      
      const startOfMonth = new Date(todayBrasilia.getFullYear(), todayBrasilia.getMonth(), 1);
      const startOfYear = new Date(todayBrasilia.getFullYear(), 0, 1);

      const startOfMonthStr = toBrasiliaDateISO(startOfMonth);
      const startOfYearStr = toBrasiliaDateISO(startOfYear);

      console.log('📊 Loading period stats:', {
        today: todayStr,
        tomorrow: tomorrowStr,
        startOfMonth: startOfMonthStr,
        startOfYear: startOfYearStr
      });

      const { start: todayStart } = getBrasiliaDayBoundsISO(todayStr);
      const { start: tomorrowStart } = getBrasiliaDayBoundsISO(tomorrowStr);
      const { start: monthStart } = getBrasiliaDayBoundsISO(startOfMonthStr);
      const { start: yearStart } = getBrasiliaDayBoundsISO(startOfYearStr);

      // Vendas do dia - apenas hoje (paginado + ignora cancelados)
      const dailyData = await fetchAllPaginated<any>(() =>
        supabaseTenant
          .from('orders')
          .select('total_amount, cart_id, is_paid')
          .or('is_cancelled.is.null,is_cancelled.eq.false')
          .gte('created_at', todayStart)
          .lt('created_at', tomorrowStart)
      );

      // Vendas do mês - do início do mês até agora
      const monthlyData = await fetchAllPaginated<any>(() =>
        supabaseTenant
          .from('orders')
          .select('total_amount, cart_id, is_paid')
          .or('is_cancelled.is.null,is_cancelled.eq.false')
          .gte('created_at', monthStart)
      );

      // Vendas do ano - do início do ano até agora
      const yearlyData = await fetchAllPaginated<any>(() =>
        supabaseTenant
          .from('orders')
          .select('total_amount, cart_id, is_paid')
          .or('is_cancelled.is.null,is_cancelled.eq.false')
          .gte('created_at', yearStart)
      );

      const dailyOrders = { data: dailyData };
      const monthlyOrders = { data: monthlyData };
      const yearlyOrders = { data: yearlyData };

      console.log('📊 Orders loaded:', {
        daily: dailyOrders.data?.length || 0,
        monthly: monthlyOrders.data?.length || 0,
        yearly: yearlyOrders.data?.length || 0
      });

      // Helper function to get products count for given cart IDs with sale_type filter
      const getProductsCountFiltered = async (cartIds: number[]) => {
        if (cartIds.length === 0) return [];
        
        const { data: cartItems } = await supabaseTenant
          .from('cart_items')
          .select('qty, product_code')
          .in('cart_id', cartIds);
        
        if (saleTypeFilter === 'ALL') {
          return cartItems || [];
        }
        
        // Buscar sale_type pelos códigos
        const productCodes = [...new Set(cartItems?.map(ci => ci.product_code).filter(Boolean) || [])];
        if (productCodes.length === 0) return [];
        
        const { data: products } = await supabaseTenant
          .from('products')
          .select('code, sale_type')
          .in('code', productCodes);
        
        const productSaleTypes: Record<string, string> = {};
        products?.forEach(p => {
          productSaleTypes[p.code] = p.sale_type;
        });
        
        return (cartItems || []).filter(item => {
          const productSaleType = item.product_code ? productSaleTypes[item.product_code] : null;
          return productSaleType === saleTypeFilter || productSaleType === 'AMBOS';
        });
      };

      // Helper to filter orders by cart_ids that have products of the correct type
      const filterOrdersBySaleType = async (orders: any[]) => {
        if (saleTypeFilter === 'ALL' || !orders || orders.length === 0) {
          return orders || [];
        }
        
        const cartIds = orders.map(o => o.cart_id).filter(Boolean);
        if (cartIds.length === 0) return orders;
        
        const { data: cartItems } = await supabaseTenant
          .from('cart_items')
          .select('cart_id, product_code')
          .in('cart_id', cartIds);
        
        // Buscar sale_type pelos códigos
        const productCodes = [...new Set(cartItems?.map(ci => ci.product_code).filter(Boolean) || [])];
        if (productCodes.length === 0) return [];
        
        const { data: products } = await supabaseTenant
          .from('products')
          .select('code, sale_type')
          .in('code', productCodes);
        
        const productSaleTypes: Record<string, string> = {};
        products?.forEach(p => {
          productSaleTypes[p.code] = p.sale_type;
        });
        
        const validCartIds = new Set<number>();
        cartItems?.forEach(item => {
          const productSaleType = item.product_code ? productSaleTypes[item.product_code] : null;
          if (productSaleType === saleTypeFilter || productSaleType === 'AMBOS') {
            validCartIds.add(item.cart_id);
          }
        });
        
        return orders.filter(o => o.cart_id && validCartIds.has(o.cart_id));
      };

      // Filtrar orders por tipo de venda
      const [filteredDaily, filteredMonthly, filteredYearly] = await Promise.all([
        filterOrdersBySaleType(dailyOrders.data || []),
        filterOrdersBySaleType(monthlyOrders.data || []),
        filterOrdersBySaleType(yearlyOrders.data || [])
      ]);

      // Get cart IDs for each period
      const dailyCartIds = filteredDaily.map(o => o.cart_id).filter(Boolean);
      const monthlyCartIds = filteredMonthly.map(o => o.cart_id).filter(Boolean);
      const yearlyCartIds = filteredYearly.map(o => o.cart_id).filter(Boolean);


      const calculateStats = async (orders: any[], cartIds: number[]): Promise<PeriodStats> => {
        const paidOrders = orders.filter(o => o.is_paid);
        const unpaidOrders = orders.filter(o => !o.is_paid);
        
        const totalSales = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
        const paidSales = paidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
        const unpaidSales = unpaidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
        
        const totalOrdersCount = orders.length;
        const paidOrdersCount = paidOrders.length;
        const unpaidOrdersCount = unpaidOrders.length;
        
        // Get products for all cart_ids
        const products = await getProductsCountFiltered(cartIds);
        const totalProducts = products.reduce((sum, item) => sum + item.qty, 0);
        
        // Get products for paid orders
        const paidCartIds = paidOrders.map(o => o.cart_id).filter(Boolean);
        const paidProductsList = await getProductsCountFiltered(paidCartIds);
        const paidProducts = paidProductsList.reduce((sum, item) => sum + item.qty, 0);
        
        // Get products for unpaid orders
        const unpaidCartIds = unpaidOrders.map(o => o.cart_id).filter(Boolean);
        const unpaidProductsList = await getProductsCountFiltered(unpaidCartIds);
        const unpaidProducts = unpaidProductsList.reduce((sum, item) => sum + item.qty, 0);
        
        const avgTicket = totalOrdersCount > 0 ? totalSales / totalOrdersCount : 0;
        const paidAvgTicket = paidOrdersCount > 0 ? paidSales / paidOrdersCount : 0;
        const unpaidAvgTicket = unpaidOrdersCount > 0 ? unpaidSales / unpaidOrdersCount : 0;

        return {
          total_sales: totalSales,
          paid_sales: paidSales,
          unpaid_sales: unpaidSales,
          total_orders: totalOrdersCount,
          paid_orders: paidOrdersCount,
          unpaid_orders: unpaidOrdersCount,
          total_products: totalProducts,
          paid_products: paidProducts,
          unpaid_products: unpaidProducts,
          avg_ticket: avgTicket,
          paid_avg_ticket: paidAvgTicket,
          unpaid_avg_ticket: unpaidAvgTicket
        };
      };

      const [dailyStats, monthlyStats, yearlyStats] = await Promise.all([
        calculateStats(filteredDaily, dailyCartIds),
        calculateStats(filteredMonthly, monthlyCartIds),
        calculateStats(filteredYearly, yearlyCartIds)
      ]);

      setPeriodStats({
        daily: dailyStats,
        monthly: monthlyStats,
        yearly: yearlyStats
      });
    } catch (error: any) {
      console.error('Error loading period stats:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar estatísticas do período',
        variant: 'destructive'
      });
    }
  };

  const loadTopProducts = async () => {
    try {
      let dateFilter = '';
      let endDateFilter = '';
      const todayBras = getBrasiliaDate();
      
      switch (selectedPeriod) {
        case 'today':
          dateFilter = getBrasiliaDateISO();
          break;
        case 'yesterday':
          const yesterdayProd = new Date(todayBras);
          yesterdayProd.setDate(yesterdayProd.getDate() - 1);
          dateFilter = toBrasiliaDateISO(yesterdayProd);
          endDateFilter = dateFilter;
          break;
        case 'month':
          const startOfMonth = new Date(todayBras.getFullYear(), todayBras.getMonth(), 1);
          dateFilter = toBrasiliaDateISO(startOfMonth);
          break;
        case 'year':
          const startOfYear = new Date(todayBras.getFullYear(), 0, 1);
          dateFilter = toBrasiliaDateISO(startOfYear);
          break;
        case 'custom':
          if (!startDate || !endDate) return;
          dateFilter = startDate;
          endDateFilter = endDate;
          break;
      }

      // First, get orders in the date range (paginado + ignora cancelados)
      const buildOrdersQuery = () => {
        let q = supabaseTenant
          .from('orders')
          .select('id, cart_id')
          .or('is_cancelled.is.null,is_cancelled.eq.false');

        if ((selectedPeriod === 'custom' || selectedPeriod === 'yesterday') && dateFilter && endDateFilter) {
          const { start } = getBrasiliaDayBoundsISO(dateFilter);
          const { end } = getBrasiliaDayBoundsISO(endDateFilter);
          q = q.gte('created_at', start).lte('created_at', end);
        } else if (dateFilter) {
          const { start } = getBrasiliaDayBoundsISO(dateFilter);
          q = q.gte('created_at', start);
        }
        return q;
      };

      const ordersData = await fetchAllPaginated<any>(buildOrdersQuery);

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
        .select('qty, unit_price, product_name, product_code')
        .in('cart_id', cartIds);

      if (cartItemsError) throw cartItemsError;

      // Filtrar por tipo de venda se necessário
      let filteredCartItems = cartItemsData || [];
      
      if (saleTypeFilter !== 'ALL' && cartItemsData && cartItemsData.length > 0) {
        // Buscar sale_type pelos códigos
        const productCodes = [...new Set(cartItemsData.map(ci => ci.product_code).filter(Boolean))];
        
        if (productCodes.length > 0) {
          const { data: products } = await supabaseTenant
            .from('products')
            .select('code, sale_type')
            .in('code', productCodes);
          
          const productSaleTypes: Record<string, string> = {};
          products?.forEach(p => {
            productSaleTypes[p.code] = p.sale_type;
          });
          
          filteredCartItems = cartItemsData.filter(item => {
            const productSaleType = item.product_code ? productSaleTypes[item.product_code] : null;
            return productSaleType === saleTypeFilter || productSaleType === 'AMBOS';
          });
        } else {
          filteredCartItems = [];
        }
      }

      // Agrupar por produto
      const productMap = new Map<string, ProductSales>();

      filteredCartItems.forEach(item => {
        const productName = item.product_name || 'Produto removido';
        const productCode = item.product_code || 'N/A';
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
    } catch (error: any) {
      console.error('Error loading top products:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar produtos mais vendidos',
        variant: 'destructive'
      });
    }
  };

  const loadWhatsAppGroupStats = async () => {
    try {
      // Buscar grupos permitidos configurados para este tenant
      let allowedGroupNames = new Set<string>();
      
      if (tenantId) {
        try {
          const { data: allowedGroups } = await supabaseTenant
            .from('whatsapp_allowed_groups')
            .select('group_name')
            .eq('is_active', true);
          
          if (allowedGroups && allowedGroups.length > 0) {
            allowedGroups.forEach(g => allowedGroupNames.add(g.group_name));
            console.log('✅ Grupos permitidos carregados:', allowedGroupNames.size, Array.from(allowedGroupNames));
          } else {
            console.log('⚠️ Nenhum grupo configurado para este tenant');
          }
        } catch (groupsError) {
          console.warn('⚠️ Erro ao carregar grupos permitidos:', groupsError);
        }
      }
      
      // Buscar lista de grupos via Z-API para obter os nomes reais (mapeamento JID -> Nome)
      let zapiGroupNames = new Map<string, string>();
      
      if (tenantId) {
        try {
          const response = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
            body: { action: 'list-groups', tenant_id: tenantId }
          });
          
          // Silenciar erros de integração não configurada
          if (response.error) {
            console.warn('⚠️ Z-API não configurado ou erro na conexão:', response.error);
          } else if (response.data) {
            // Z-API retorna array de chats com phone e name
            // Grupos têm isGroup: true e phone no formato "120363424101599485-group"
            const chats = response.data;
            if (Array.isArray(chats)) {
              for (const chat of chats) {
                if (chat.isGroup === true && chat.phone && chat.name) {
                  // Mapear pelo phone ID do grupo
                  zapiGroupNames.set(chat.phone, chat.name);
                  // Também mapear por variações comuns
                  const phoneClean = chat.phone.replace('-group', '');
                  zapiGroupNames.set(phoneClean, chat.name);
                  // E pelo nome também para permitir busca reversa
                  zapiGroupNames.set(chat.name, chat.name);
                }
              }
              console.log('📱 Grupos Z-API carregados:', zapiGroupNames.size, Array.from(zapiGroupNames.entries()));
            } else if (response.data?.groups) {
              // Fallback para formato antigo
              for (const group of response.data.groups) {
                if (group.phone && group.name) {
                  zapiGroupNames.set(group.phone, group.name);
                }
              }
            }
          }
        } catch (zapiError) {
          // Silenciar completamente - Z-API pode não estar configurado
          console.warn('⚠️ Não foi possível carregar nomes dos grupos via Z-API:', zapiError);
        }
      }
      
      // Aplicar filtros de data (sempre em horário Brasília)
      let dateFilter = '';
      let endDateFilter = '';
      const todayBrasWA = getBrasiliaDate();

      switch (whatsappFilter) {
        case 'today':
          dateFilter = getBrasiliaDateISO();
          break;
        case 'yesterday': {
          const yesterdayWA = new Date(todayBrasWA);
          yesterdayWA.setDate(yesterdayWA.getDate() - 1);
          dateFilter = toBrasiliaDateISO(yesterdayWA);
          endDateFilter = dateFilter;
          break;
        }
        case 'month': {
          const startOfMonth = new Date(todayBrasWA.getFullYear(), todayBrasWA.getMonth(), 1);
          dateFilter = toBrasiliaDateISO(startOfMonth);
          break;
        }
        case 'year': {
          const startOfYear = new Date(todayBrasWA.getFullYear(), 0, 1);
          dateFilter = toBrasiliaDateISO(startOfYear);
          break;
        }
        case 'custom':
          if (!whatsappStartDate || !whatsappEndDate) return;
          dateFilter = whatsappStartDate;
          endDateFilter = whatsappEndDate;
          break;
        case 'all':
          // No date filter
          break;
      }

      // Buscar pedidos com informação de grupo do carrinho (paginado + ignora cancelados)
      const buildWAQuery = () => {
        let q = supabaseTenant
          .from('orders')
          .select(`
            id, 
            total_amount, 
            is_paid, 
            cart_id, 
            customer_phone,
            whatsapp_group_name,
            carts(whatsapp_group_name)
          `)
          .or('is_cancelled.is.null,is_cancelled.eq.false');

        if ((whatsappFilter === 'custom' || whatsappFilter === 'yesterday') && dateFilter && endDateFilter) {
          const { start } = getBrasiliaDayBoundsISO(dateFilter);
          const { end } = getBrasiliaDayBoundsISO(endDateFilter);
          q = q.gte('created_at', start).lte('created_at', end);
        } else if (dateFilter) {
          const { start } = getBrasiliaDayBoundsISO(dateFilter);
          q = q.gte('created_at', start);
        }
        return q;
      };

      const orders = await fetchAllPaginated<any>(buildWAQuery);

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
        let groupCode = order.whatsapp_group_name || order.carts?.whatsapp_group_name || 'Pedido Manual';

        // Verificar se é um grupo permitido para este tenant
        // NOVA LÓGICA: Usar grupos configurados pelo tenant OU Pedido Manual
        let isAllowedGroup = groupCode === 'Pedido Manual';
        let resolvedGroupName = groupCode;
        
        // Resolver nome do grupo via Z-API se for JID
        if (groupCode !== 'Pedido Manual') {
          if (zapiGroupNames.has(groupCode)) {
            resolvedGroupName = zapiGroupNames.get(groupCode)!;
          } else if (groupCode.includes('@g.us')) {
            // Fallback: usar últimos 8 dígitos do JID
            resolvedGroupName = `Grupo ${groupCode.split('@')[0].slice(-8)}`;
          } else if (groupCode.includes('-')) {
            resolvedGroupName = `Grupo ${groupCode.slice(-8)}`;
          } else {
            // Usar o próprio groupCode como nome
            resolvedGroupName = groupCode;
          }
        }
        
        // Verificar se o grupo (ou seu nome resolvido) está na lista de permitidos
        if (allowedGroupNames.size > 0) {
          // Se há grupos configurados, usar apenas eles
          isAllowedGroup = groupCode === 'Pedido Manual' || 
                          allowedGroupNames.has(groupCode) || 
                          allowedGroupNames.has(resolvedGroupName);
        } else {
          // Fallback: se não há grupos configurados, usar padrões antigos (para retrocompatibilidade)
          const groupPatterns = ['#', 'GRUPO', 'VIP', 'Bazar', 'Festival', '@g.us'];
          isAllowedGroup = groupCode === 'Pedido Manual' || 
                          zapiGroupNames.has(groupCode) ||
                          groupPatterns.some(pattern => 
                            groupCode.toLowerCase().includes(pattern.toLowerCase())
                          ) ||
                          groupPatterns.some(pattern => 
                            resolvedGroupName.toLowerCase().includes(pattern.toLowerCase())
                          );
        }

        // FILTRAR: Ignorar entradas que não são grupos permitidos
        if (!isAllowedGroup) {
          console.log(`⏭️ Ignorando pedido ${order.id} - "${groupCode}" (${resolvedGroupName}) não é um grupo permitido`);
          return; // Skip this order
        }

        // Usar o nome resolvido para exibição
        let groupName = groupCode === 'Pedido Manual' ? 'Pedido Manual' : resolvedGroupName;
        
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
    } catch (error: any) {
      console.error('Error loading WhatsApp group stats:', error);
      toast({ title: 'Erro', description: error?.message || 'Erro ao carregar estatísticas por grupo de WhatsApp', variant: 'destructive' });
    }
  };

  const loadTopCustomers = async () => {
    try {
      let dateFilter = '';
      let endDateFilter = '';
      const todayBrasCust = getBrasiliaDate();

      switch (customersFilter) {
        case 'today':
          dateFilter = getBrasiliaDateISO();
          break;
        case 'yesterday': {
          const yesterdayCust = new Date(todayBrasCust);
          yesterdayCust.setDate(yesterdayCust.getDate() - 1);
          dateFilter = toBrasiliaDateISO(yesterdayCust);
          endDateFilter = dateFilter;
          break;
        }
        case 'month': {
          const startOfMonth = new Date(todayBrasCust.getFullYear(), todayBrasCust.getMonth(), 1);
          dateFilter = toBrasiliaDateISO(startOfMonth);
          break;
        }
        case 'year': {
          const startOfYear = new Date(todayBrasCust.getFullYear(), 0, 1);
          dateFilter = toBrasiliaDateISO(startOfYear);
          break;
        }
        case 'custom':
          if (!customersStartDate || !customersEndDate) return;
          dateFilter = customersStartDate;
          endDateFilter = customersEndDate;
          break;
        case 'all':
          // No date filter
          break;
      }

      // Buscar pedidos (paginado + ignora cancelados)
      const buildCustQuery = () => {
        let q = supabaseTenant
          .from('orders')
          .select(`
            id, 
            customer_phone,
            customer_name,
            total_amount, 
            is_paid, 
            cart_id,
            created_at
          `)
          .or('is_cancelled.is.null,is_cancelled.eq.false');

        if ((customersFilter === 'custom' || customersFilter === 'yesterday') && dateFilter && endDateFilter) {
          const { start } = getBrasiliaDayBoundsISO(dateFilter);
          const { end } = getBrasiliaDayBoundsISO(endDateFilter);
          q = q.gte('created_at', start).lte('created_at', end);
        } else if (dateFilter) {
          const { start } = getBrasiliaDayBoundsISO(dateFilter);
          q = q.gte('created_at', start);
        }
        return q;
      };

      const orders = await fetchAllPaginated<any>(buildCustQuery);

      console.log('📦 Orders encontrados para clientes:', orders?.length);

      // Aplicar filtro de tipo de venda se necessário
      let filteredOrders = orders || [];
      
      if (saleTypeFilter !== 'ALL' && orders && orders.length > 0) {
        const cartIds = orders.map(o => o.cart_id).filter(Boolean);
        
        if (cartIds.length > 0) {
          // Buscar cart_items com product_code
          const { data: cartItems } = await supabaseTenant
            .from('cart_items')
            .select('cart_id, product_code')
            .in('cart_id', cartIds);
          
          // Coletar todos os product_codes únicos
          const productCodes = [...new Set(cartItems?.map(ci => ci.product_code).filter(Boolean) || [])];
          
          // Buscar products por código para obter sale_type
          let productSaleTypes: Record<string, string> = {};
          if (productCodes.length > 0) {
            const { data: products } = await supabaseTenant
              .from('products')
              .select('code, sale_type')
              .in('code', productCodes);
            
            products?.forEach(p => {
              productSaleTypes[p.code] = p.sale_type;
            });
          }
          
          // Filtrar cart_ids que têm produtos do tipo selecionado
          const validCartIds = new Set<number>();
          cartItems?.forEach(item => {
            const productSaleType = item.product_code ? productSaleTypes[item.product_code] : null;
            if (productSaleType === saleTypeFilter || productSaleType === 'AMBOS') {
              validCartIds.add(item.cart_id);
            }
          });
          
          // Filtrar orders pelos cart_ids válidos
          filteredOrders = orders.filter(o => o.cart_id && validCartIds.has(o.cart_id));
        } else {
          // Se não há cart_ids, não há como filtrar - mostrar todos quando ALL, ou vazio quando filtro específico
          filteredOrders = [];
        }
      }

      // Buscar dados dos clientes cadastrados
      const phones = [...new Set(filteredOrders?.map(o => o.customer_phone).filter(Boolean))] as string[];
      const { data: customers } = phones.length > 0 ? await supabaseTenant
        .from('customers')
        .select('phone, name')
        .in('phone', phones) : { data: [] };
      
      // Criar mapa de telefone -> nome cadastrado
      const customerNamesMap = new Map<string, string>();
      customers?.forEach(customer => {
        customerNamesMap.set(customer.phone, customer.name);
      });

      // Criar mapa para agrupar estatísticas por cliente
      const customerMap = new Map<string, CustomerStats>();

      // Coletar cart items para contar produtos
      const cartIds = filteredOrders?.map(o => o.cart_id).filter(Boolean) as number[];
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
      filteredOrders?.forEach(order => {
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
            last_order_date: order.created_at,
            last_paid_order_date: null,
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
          if (!customer.last_paid_order_date || order.created_at > customer.last_paid_order_date) {
            customer.last_paid_order_date = order.created_at;
          }
        } else {
          customer.unpaid_orders += 1;
          customer.unpaid_revenue += amount;
        }
      });

      // ========= RANKING - SCORE COMPOSTO PONDERADO =========
      // Score = (Receita Paga / Máx. Receita Paga) × 70
      //       + (Total Pedidos / Máx. Total Pedidos) × 30
      // Usa Receita Paga (não beneficia clientes com pagamentos pendentes).
      // Empate: desempata pela Receita Paga.
      const customersRaw = Array.from(customerMap.values());

      const maxPaidRevenue = customersRaw.reduce((m, c) => Math.max(m, c.paid_revenue || 0), 0);
      const maxTotalOrders = customersRaw.reduce((m, c) => Math.max(m, c.total_orders || 0), 0);

      const customersArray = customersRaw
        .map((c) => {
          const revenueComponent = maxPaidRevenue > 0 ? (c.paid_revenue / maxPaidRevenue) * 70 : 0;
          const ordersComponent = maxTotalOrders > 0 ? (c.total_orders / maxTotalOrders) * 30 : 0;
          return {
            ...c,
            score: Math.round((revenueComponent + ordersComponent) * 100) / 100,
          };
        })
        .sort((a, b) => {
          if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
          return b.paid_revenue - a.paid_revenue;
        })
        .slice(0, 50);

      console.log('📊 Top clientes (Score Composto Ponderado):', customersArray);
      setTopCustomers(customersArray);
    } catch (error: any) {
      console.error('Error loading top customers:', error);
      toast({ 
        title: 'Erro', 
        description: error?.message || 'Erro ao carregar clientes com mais compras', 
        variant: 'destructive' 
      });
    }
  };

  // ============ NOVO: série diária para o gráfico de evolução ============
  const computeGlobalRange = (): { startISO: string; endISO: string } | null => {
    const today = getBrasiliaDate();
    let startDateObj: Date | null = null;
    let endDateObj: Date | null = new Date(today);

    switch (globalPeriod) {
      case 'today':
        startDateObj = new Date(today);
        break;
      case 'yesterday': {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        startDateObj = y;
        endDateObj = y;
        break;
      }
      case '7d': {
        const s = new Date(today);
        s.setDate(s.getDate() - 6);
        startDateObj = s;
        break;
      }
      case '30d': {
        const s = new Date(today);
        s.setDate(s.getDate() - 29);
        startDateObj = s;
        break;
      }
      case 'month':
        startDateObj = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'year':
        startDateObj = new Date(today.getFullYear(), 0, 1);
        break;
      case 'custom':
        if (!globalStart || !globalEnd) return null;
        return {
          startISO: getBrasiliaDayBoundsISO(globalStart).start,
          endISO: getBrasiliaDayBoundsISO(globalEnd).end,
        };
    }
    if (!startDateObj || !endDateObj) return null;
    return {
      startISO: getBrasiliaDayBoundsISO(toBrasiliaDateISO(startDateObj)).start,
      endISO: getBrasiliaDayBoundsISO(toBrasiliaDateISO(endDateObj)).end,
    };
  };

  const loadDailySeries = async () => {
    try {
      const range = computeGlobalRange();
      if (!range) {
        setDailySeries([]);
        return;
      }
      const orders = await fetchAllPaginated<any>(() =>
        supabaseTenant
          .from('orders')
          .select('id, total_amount, is_paid, created_at')
          .or('is_cancelled.is.null,is_cancelled.eq.false')
          .gte('created_at', range.startISO)
          .lte('created_at', range.endISO)
          .order('created_at', { ascending: true })
      );

      const byDay = new Map<string, { paid: number; unpaid: number; total: number; orders: number }>();
      orders.forEach((o) => {
        const day = o.created_at.slice(0, 10);
        const cur = byDay.get(day) || { paid: 0, unpaid: 0, total: 0, orders: 0 };
        const amt = Number(o.total_amount) || 0;
        if (o.is_paid) cur.paid += amt;
        else cur.unpaid += amt;
        cur.total += amt;
        cur.orders += 1;
        byDay.set(day, cur);
      });
      const arr = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));
      setDailySeries(arr);
    } catch (err) {
      console.error('Error loading daily series:', err);
    }
  };

  // Propaga mudança do período global para os filtros internos por aba
  const propagateGlobalPeriod = (period: GlobalPeriod) => {
    if (period === '7d' || period === '30d') {
      const today = getBrasiliaDate();
      const days = period === '7d' ? 6 : 29;
      const s = new Date(today);
      s.setDate(s.getDate() - days);
      const startStr = toBrasiliaDateISO(s);
      const endStr = toBrasiliaDateISO(today);
      setSalesFilter('custom'); setSalesStartDate(startStr); setSalesEndDate(endStr);
      setSelectedPeriod('custom'); setStartDate(startStr); setEndDate(endStr);
      setWhatsappFilter('custom'); setWhatsappStartDate(startStr); setWhatsappEndDate(endStr);
      setCustomersFilter('custom'); setCustomersStartDate(startStr); setCustomersEndDate(endStr);
    } else if (period === 'custom') {
      if (globalStart && globalEnd) {
        setSalesFilter('custom'); setSalesStartDate(globalStart); setSalesEndDate(globalEnd);
        setSelectedPeriod('custom'); setStartDate(globalStart); setEndDate(globalEnd);
        setWhatsappFilter('custom'); setWhatsappStartDate(globalStart); setWhatsappEndDate(globalEnd);
        setCustomersFilter('custom'); setCustomersStartDate(globalStart); setCustomersEndDate(globalEnd);
      }
    } else {
      setSalesFilter(period as any);
      setSelectedPeriod(period as any);
      setWhatsappFilter(period as any);
      setCustomersFilter(period as any);
    }
  };

  const handleSetGlobalPeriod = (p: GlobalPeriod) => {
    setGlobalPeriod(p);
    if (p !== 'custom') propagateGlobalPeriod(p);
  };

  const applyCustomGlobal = () => {
    if (!globalStart || !globalEnd) return;
    propagateGlobalPeriod('custom');
  };

  const loadAllReports = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadTodaySales(),
        loadPeriodStats(),
        loadTopProducts(),
        loadWhatsAppGroupStats(),
        loadTopCustomers(),
        loadDailySeries(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      // Inicializa propagando o período padrão
      propagateGlobalPeriod(globalPeriod);
      loadAllReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Re-carregar quando mudar o filtro de tipo de venda
  useEffect(() => {
    if (tenantId) {
      loadAllReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleTypeFilter]);

  // Recarrega série diária quando o período global muda
  useEffect(() => {
    if (tenantId) loadDailySeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalPeriod, globalStart, globalEnd, tenantId]);

  // ============ HELPERS DE FORMATAÇÃO PARA O REDESIGN ============
  const formatShortDate = (iso: string) => {
    try {
      const d = new Date(iso + 'T12:00:00-03:00');
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return iso;
    }
  };
  const formatNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
  const formatCompactCurrency = (v: number) => {
    if (Math.abs(v) >= 1000) {
      return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
    }
    return formatCurrency(v);
  };

  // ============ EXPORT CSV ============
  const exportCSV = () => {
    const rows: string[] = [];
    rows.push('Tipo,Item,Qtd,Receita');
    topProducts.forEach((p) => {
      rows.push(`Produto,"${p.product_name.replace(/"/g, '""')}",${p.total_sold},${p.total_revenue.toFixed(2)}`);
    });
    topCustomers.forEach((c) => {
      rows.push(`Cliente,"${c.customer_name.replace(/"/g, '""')}",${c.total_orders},${c.paid_revenue.toFixed(2)}`);
    });
    whatsappGroupStats.forEach((g) => {
      rows.push(`Grupo,"${g.group_name.replace(/"/g, '""')}",${g.total_orders},${g.paid_revenue.toFixed(2)}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: 'Arquivo CSV gerado com sucesso.' });
  };

  // ============ DERIVADOS PARA OS WIDGETS ============
  const stats = periodStats?.monthly; // KPIs usam o "mês" como base do mockup; se preferir, troque por daily/yearly
  const totalOrdersAll = stats?.total_orders ?? 0;
  const conversionRate = totalOrdersAll > 0 ? (stats!.paid_orders / totalOrdersAll) * 100 : 0;

  const topProdChartData = [...topProducts]
    .sort((a, b) => (prodSort === 'qty' ? b.total_sold - a.total_sold : b.total_revenue - a.total_revenue))
    .slice(0, 8)
    .map((p) => ({
      name: p.product_name.length > 22 ? p.product_name.slice(0, 22) + '…' : p.product_name,
      value: prodSort === 'qty' ? p.total_sold : p.total_revenue,
    }));

  const groupChartData = whatsappGroupStats.slice(0, 10).map((g) => ({
    name: g.group_name.length > 16 ? g.group_name.slice(0, 16) + '…' : g.group_name,
    pago: g.paid_revenue,
    pendente: g.unpaid_revenue,
  }));

  const lineSeries = dailySeries.map((d) => ({
    date: formatShortDate(d.date),
    Pagas: metricMode === 'value' ? d.paid : 0,
    Pendentes: metricMode === 'value' ? d.unpaid : 0,
    Total: metricMode === 'value' ? d.total : d.orders,
  }));

  const donutData = [
    { name: 'Pagos', value: stats?.paid_orders ?? 0, color: 'hsl(142, 71%, 45%)' },
    { name: 'Pendentes', value: stats?.unpaid_orders ?? 0, color: 'hsl(24, 95%, 53%)' },
  ];

  const periodPills: { id: GlobalPeriod; label: string }[] = [
    { id: 'today', label: 'Hoje' },
    { id: 'yesterday', label: 'Ontem' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: 'month', label: 'Este mês' },
    { id: 'year', label: 'Este ano' },
    { id: 'custom', label: 'Personalizado' },
  ];

  const RechartsBlock = require('recharts');
  const {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    BarChart, Bar, Legend, PieChart, Pie, Cell,
  } = RechartsBlock;

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* ================= TOPBAR ================= */}
      <div className="bg-card/70 backdrop-blur-xl border border-border/60 rounded-2xl shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2 whitespace-nowrap" style={{ fontFamily: "'Space Grotesk', Inter, sans-serif" }}>
            <BarChart3 className="h-5 w-5 text-primary" />
            Relatórios
          </h1>
          <div className="hidden md:block w-px h-5 bg-border" />
          <div className="flex flex-wrap gap-1.5">
            {periodPills.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSetGlobalPeriod(p.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  globalPeriod === p.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {globalPeriod === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={globalStart} onChange={(e) => setGlobalStart(e.target.value)} className="h-8 w-36 text-xs" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={globalEnd} onChange={(e) => setGlobalEnd(e.target.value)} className="h-8 w-36 text-xs" />
              <Button size="sm" className="h-8" onClick={applyCustomGlobal}>Aplicar</Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex border border-border rounded-lg overflow-hidden">
            {(['ALL', 'LIVE', 'BAZAR'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSaleTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  saleTypeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {t === 'ALL' ? 'Todos' : t === 'LIVE' ? 'Live' : 'Bazar'}
              </button>
            ))}
          </div>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setMetricMode('value')}
              className={`px-3 py-1.5 text-xs font-semibold ${metricMode === 'value' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >R$</button>
            <button
              onClick={() => setMetricMode('qty')}
              className={`px-3 py-1.5 text-xs font-semibold ${metricMode === 'qty' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >Qtd</button>
          </div>
          <Button size="sm" variant="outline" onClick={loadAllReports} disabled={loading} className="h-8">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Atualizar
          </Button>
          <Button size="sm" onClick={exportCSV} className="h-8">Exportar</Button>
        </div>
      </div>

      {/* ================= KPI CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Receita Paga', value: formatCurrency(stats?.paid_sales ?? 0), sub: `${stats?.paid_orders ?? 0} pedidos`, color: 'bg-emerald-500', icon: DollarSign },
          { label: 'Pedidos', value: formatNumber(stats?.total_orders ?? 0), sub: `${stats?.paid_orders ?? 0} pagos · ${stats?.unpaid_orders ?? 0} pendentes`, color: 'bg-blue-500', icon: ShoppingBag },
          { label: 'Produtos Vendidos', value: formatNumber(stats?.total_products ?? 0), sub: `${formatNumber(stats?.paid_products ?? 0)} pagos`, color: 'bg-violet-500', icon: Package },
          { label: 'Ticket Médio', value: formatCurrency(stats?.avg_ticket ?? 0), sub: `Pago: ${formatCurrency(stats?.paid_avg_ticket ?? 0)}`, color: 'bg-orange-500', icon: TrendingUp },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="relative bg-card border border-border/60 rounded-2xl p-5 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className={`absolute left-0 top-0 h-full w-1 ${kpi.color}`} />
              <Icon className="absolute top-4 right-4 h-7 w-7 text-foreground/5" />
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{kpi.label}</div>
              <div className="text-2xl font-bold text-foreground leading-none mb-1.5" style={{ fontFamily: "'Space Grotesk', Inter, sans-serif" }}>{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.sub}</div>
            </div>
          );
        })}
      </div>

      {/* ================= LINE CHART: EVOLUÇÃO ================= */}
      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Evolução de Vendas
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />Pagas</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />Pendentes</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />{metricMode === 'value' ? 'Total' : 'Pedidos'}</span>
          </div>
        </div>
        <div className="px-3 py-3" style={{ height: 260 }}>
          {lineSeries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados no período selecionado</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: number) => metricMode === 'value' ? formatCompactCurrency(v) : formatNumber(v)} />
                <Tooltip formatter={(v: any) => metricMode === 'value' ? formatCurrency(Number(v)) : formatNumber(Number(v))} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                {metricMode === 'value' && <Line type="monotone" dataKey="Pagas" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />}
                {metricMode === 'value' && <Line type="monotone" dataKey="Pendentes" stroke="hsl(24, 95%, 53%)" strokeWidth={2} dot={false} />}
                <Line type="monotone" dataKey="Total" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ================= CHARTS ROW: TOP PRODUTOS + DONUT ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Top 8 Produtos
            </div>
            <Select value={prodSort} onValueChange={(v: any) => setProdSort(v)}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="qty">Por quantidade</SelectItem>
                <SelectItem value="revenue">Por receita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="px-3 py-3" style={{ height: 260 }}>
            {topProdChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProdChartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: number) => prodSort === 'revenue' ? formatCompactCurrency(v) : formatNumber(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={140} />
                  <Tooltip formatter={(v: any) => prodSort === 'revenue' ? formatCurrency(Number(v)) : formatNumber(Number(v))} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/60">
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Taxa de Conversão
            </div>
          </div>
          <div className="px-3 py-3 relative" style={{ height: 260 }}>
            {totalOrdersAll === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" innerRadius={60} outerRadius={88} paddingAngle={2}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [formatNumber(Number(v)), n]} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', Inter, sans-serif" }}>{conversionRate.toFixed(1)}%</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">pagos</div>
                </div>
              </>
            )}
          </div>
          <div className="px-5 pb-4 flex justify-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'hsl(142, 71%, 45%)' }} />Pagos ({stats?.paid_orders ?? 0})</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'hsl(24, 95%, 53%)' }} />Pendentes ({stats?.unpaid_orders ?? 0})</span>
          </div>
        </div>
      </div>

      {/* ================= BAR CHART: GRUPOS WHATSAPP ================= */}
      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Receita por Grupo WhatsApp
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'hsl(142, 71%, 45%)' }} />Pago</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'hsl(24, 95%, 53%)' }} />Pendente</span>
          </div>
        </div>
        <div className="px-3 py-3" style={{ height: 220 }}>
          {groupChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groupChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: number) => formatCompactCurrency(v)} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Bar dataKey="pago" stackId="a" fill="hsl(142, 71%, 45%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pendente" stackId="a" fill="hsl(24, 95%, 53%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ================= TABLE SECTION COM 3 ABAS ================= */}
      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <div className="flex border-b-2 border-border/60 px-3">
          {([
            { id: 'produtos', label: '🏆 Produtos' },
            { id: 'clientes', label: '👥 Clientes' },
            { id: 'grupos', label: '💬 Grupos' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTableTab(t.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors -mb-[2px] border-b-2 ${
                tableTab === t.id ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tableTab === 'produtos' && (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="min-w-[140px]">Participação</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Preço Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>
                ) : (() => {
                  const maxQty = Math.max(...topProducts.map(p => p.total_sold));
                  return topProducts.map((p, i) => {
                    const pct = maxQty > 0 ? (p.total_sold / maxQty) * 100 : 0;
                    return (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.product_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{p.product_code}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{formatNumber(p.total_sold)}</TableCell>
                        <TableCell>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(p.total_revenue)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(p.avg_price)}</TableCell>
                      </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
          </div>
        )}

        {tableTab === 'clientes' && (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="text-center w-16">Score</TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-center">Pedidos</TableHead>
                  <TableHead className="text-center">Pagos</TableHead>
                  <TableHead className="text-right">Receita Total</TableHead>
                  <TableHead className="text-right">Receita Paga</TableHead>
                  <TableHead className="text-center">Taxa</TableHead>
                  <TableHead>Última compra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>
                ) : topCustomers.map((c, i) => {
                  const taxa = c.total_orders > 0 ? (c.paid_orders / c.total_orders) * 100 : 0;
                  return (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="text-center">
                        <Badge className={`${i === 0 ? 'bg-yellow-100 text-yellow-800' : i === 1 ? 'bg-slate-100 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-800' : 'bg-muted text-muted-foreground'} text-[10px]`}>
                          {(c.score ?? 0).toFixed(0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.customer_name}</TableCell>
                      <TableCell className="text-muted-foreground">{formatPhoneForDisplay(c.customer_phone)}</TableCell>
                      <TableCell className="text-center">{c.total_orders}</TableCell>
                      <TableCell className="text-center"><Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{c.paid_orders}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(c.total_revenue)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(c.paid_revenue)}</TableCell>
                      <TableCell className="text-center"><Badge className={taxa >= 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}>{taxa.toFixed(0)}%</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDate(c.last_order_date)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {tableTab === 'grupos' && (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-center">Pedidos</TableHead>
                  <TableHead className="text-center">Pagos</TableHead>
                  <TableHead className="text-center">Pendentes</TableHead>
                  <TableHead className="text-right">Receita Paga</TableHead>
                  <TableHead className="text-right">Receita Pendente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {whatsappGroupStats.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>
                ) : whatsappGroupStats.map((g, i) => {
                  const taxa = g.total_orders > 0 ? (g.paid_orders / g.total_orders) * 100 : 0;
                  return (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{g.group_name}</TableCell>
                      <TableCell className="text-center">{g.total_orders}</TableCell>
                      <TableCell className="text-center"><Badge className="bg-emerald-100 text-emerald-800">{g.paid_orders}</Badge></TableCell>
                      <TableCell className="text-center"><Badge className="bg-orange-100 text-orange-800">{g.unpaid_orders}</Badge></TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(g.paid_revenue)}</TableCell>
                      <TableCell className="text-right font-semibold text-orange-600">{formatCurrency(g.unpaid_revenue)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(g.total_revenue)}</TableCell>
                      <TableCell className="text-center"><Badge className={taxa >= 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}>{taxa.toFixed(0)}%</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {saleTypeFilter !== 'ALL' && (
        <Badge variant="outline" className="w-fit">
          Filtrando por: {saleTypeFilter === 'BAZAR' ? 'Bazar' : 'Live'}
        </Badge>
      )}
    </div>
  );
};

export default Relatorios;
