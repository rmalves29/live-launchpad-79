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
import { supabase } from '@/integrations/supabase/client';

interface DailySales {
  date: string;
  total_paid: number;
  total_unpaid: number;
  total_orders: number;
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

const Relatorios = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [todaySales, setTodaySales] = useState<DailySales | null>(null);
  const [periodStats, setPeriodStats] = useState<{
    daily: PeriodStats;
    monthly: PeriodStats;
    yearly: PeriodStats;
  } | null>(null);
  const [topProducts, setTopProducts] = useState<ProductSales[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'month' | 'year' | 'custom'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [salesFilter, setSalesFilter] = useState<'today' | 'month' | 'year' | 'custom' | 'all'>('all');
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');

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
      
      let query = supabase
        .from('orders')
        .select('total_amount, is_paid');

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
      const ticketMedio = totalOrders > 0 ? (totalPaid + totalUnpaid) / totalOrders : 0;

      setTodaySales({
        date: dateFilter || 'all',
        total_paid: totalPaid,
        total_unpaid: totalUnpaid,
        total_orders: totalOrders,
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
      const dailyOrders = await supabase
        .from('orders')
        .select('total_amount, cart_id')
        .gte('created_at', today.toISOString().split('T')[0] + 'T00:00:00')
        .lt('created_at', today.toISOString().split('T')[0] + 'T23:59:59');

      // Vendas do mês
      const monthlyOrders = await supabase
        .from('orders')
        .select('total_amount, cart_id')
        .gte('created_at', startOfMonth.toISOString());

      // Vendas do ano
      const yearlyOrders = await supabase
        .from('orders')
        .select('total_amount, cart_id')
        .gte('created_at', startOfYear.toISOString());

      // Helper function to get products count for given cart IDs
      const getProductsCount = async (cartIds: number[]) => {
        if (cartIds.length === 0) return [];
        
        const { data } = await supabase
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
      let ordersQuery = supabase
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
      const { data: cartItemsData, error: cartItemsError } = await supabase
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

  const loadAllReports = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadTodaySales(),
        loadPeriodStats(),
        loadTopProducts()
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllReports();
  }, []);

  useEffect(() => {
    loadTopProducts();
  }, [selectedPeriod, startDate, endDate]);

  useEffect(() => {
    loadTodaySales();
  }, [salesFilter, salesStartDate, salesEndDate]);

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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
      </Tabs>
    </div>
  );
};

export default Relatorios;