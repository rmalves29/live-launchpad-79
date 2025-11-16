import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ShoppingCart, 
  Package, 
  Users, 
  MessageSquare, 
  CreditCard, 
  Truck,
  Settings,
  BarChart3
} from 'lucide-react';

// Import components that we'll create
import TenantProducts from '@/components/tenant/TenantProducts';
import TenantCustomers from '@/components/tenant/TenantCustomers';
import TenantOrders from '@/components/tenant/TenantOrders';
import { TenantMessages } from '@/components/tenant/TenantMessages';
import { TenantMercadoPagoSettings } from '@/components/tenant/TenantMercadoPagoSettings';
import { TenantMelhorEnvioSettings } from '@/components/tenant/TenantMelhorEnvioSettings';
import { CompanySettings } from '@/components/CompanySettings';

interface DashboardStats {
  todayOrders: number;
  totalRevenue: number;
  activeProducts: number;
  totalCustomers: number;
  pendingOrders: number;
  paidOrders: number;
}

export default function TenantDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todayOrders: 0,
    totalRevenue: 0,
    activeProducts: 0,
    totalCustomers: 0,
    pendingOrders: 0,
    paidOrders: 0
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const { profile, user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.tenant_id) {
      loadStats();
    }
  }, [profile?.tenant_id]);

  const loadStats = async () => {
    if (!profile?.tenant_id) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [ordersResult, productsResult, customersResult, revenueResult] = await Promise.all([
        // Today's orders
        supabase
          .from('orders')
          .select('id, is_paid')
          .eq('tenant_id', profile.tenant_id)
          .gte('created_at', today),
        
        // Active products
        supabase
          .from('products')
          .select('id')
          .eq('tenant_id', profile.tenant_id)
          .eq('is_active', true),
        
        // Total customers
        supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', profile.tenant_id),
        
        // Total revenue (paid orders)
        supabase
          .from('orders')
          .select('total_amount')
          .eq('tenant_id', profile.tenant_id)
          .eq('is_paid', true)
      ]);

      const todayOrders = ordersResult.data?.length || 0;
      const paidTodayOrders = ordersResult.data?.filter(o => o.is_paid).length || 0;
      const pendingTodayOrders = todayOrders - paidTodayOrders;
      const totalRevenue = revenueResult.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;

      setStats({
        todayOrders,
        totalRevenue,
        activeProducts: productsResult.data?.length || 0,
        totalCustomers: customersResult.data?.length || 0,
        pendingOrders: pendingTodayOrders,
        paidOrders: paidTodayOrders
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar estatísticas',
        variant: 'destructive'
      });
    }
  };

  if (!profile?.tenant_id) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">Usuário sem Empresa</h1>
          <p className="text-muted-foreground">Este usuário não está associado a nenhuma empresa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Painel da Empresa</h1>
        <p className="text-muted-foreground">Gerencie sua empresa e vendas</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="messages">Mensagens</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pedidos Hoje</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.todayOrders}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.paidOrders} pagos, {stats.pendingOrders} pendentes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  R$ {stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pedidos confirmados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Produtos Ativos</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeProducts}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalCustomers}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Online</div>
                <p className="text-xs text-muted-foreground">
                  Integração ativa
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Integrações</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex space-x-2">
                  <div className="flex items-center space-x-1">
                    <CreditCard className="h-3 w-3 text-blue-500" />
                    <span className="text-xs">MP</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Truck className="h-3 w-3 text-orange-500" />
                    <span className="text-xs">ME</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>Acesse rapidamente as principais funcionalidades</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Button 
                  variant="outline" 
                  className="h-20 flex-col"
                  onClick={() => setActiveTab('products')}
                >
                  <Package className="h-6 w-6 mb-2" />
                  Produtos
                </Button>
                <Button 
                  variant="outline" 
                  className="h-20 flex-col"
                  onClick={() => setActiveTab('customers')}
                >
                  <Users className="h-6 w-6 mb-2" />
                  Clientes
                </Button>
                <Button 
                  variant="outline" 
                  className="h-20 flex-col"
                  onClick={() => setActiveTab('orders')}
                >
                  <ShoppingCart className="h-6 w-6 mb-2" />
                  Pedidos
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <TenantProducts />
        </TabsContent>

        <TabsContent value="customers">
          <TenantCustomers />
        </TabsContent>

        <TabsContent value="orders">
          <TenantOrders />
        </TabsContent>

        <TabsContent value="messages">
          <TenantMessages />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <CompanySettings />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TenantMercadoPagoSettings />
            <TenantMelhorEnvioSettings />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}