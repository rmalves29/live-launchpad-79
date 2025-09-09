import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Building2, 
  BarChart3, 
  ShoppingCart, 
  Users, 
  Package, 
  MessageCircle,
  Settings,
  CreditCard,
  Truck,
  AlertCircle 
} from 'lucide-react';

export default function TenantDashboard() {
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const { user, currentTenant } = useTenant();
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    orders_today: 0,
    orders_total: 0,
    revenue_month: 0,
    products_active: 0,
    customers_total: 0
  });

  useEffect(() => {
    if (tenantSlug && user) {
      loadTenantData();
    } else if (!user) {
      navigate(`/empresa/${tenantSlug}/login`);
    }
  }, [tenantSlug, user]);

  const loadTenantData = async () => {
    if (!tenantSlug) return;
    
    try {
      // Carregar dados do tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', tenantSlug)
        .eq('is_active', true)
        .single();

      if (tenantError || !tenantData) {
        toast.error('Empresa não encontrada');
        navigate('/');
        return;
      }

      setTenant(tenantData);

      // Carregar estatísticas básicas
      const today = new Date().toISOString().split('T')[0];
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

      const [ordersToday, ordersTotal, productsActive, customersTotal] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact' }).eq('tenant_id', tenantData.id).gte('created_at', today),
        supabase.from('orders').select('*', { count: 'exact' }).eq('tenant_id', tenantData.id),
        supabase.from('products').select('*', { count: 'exact' }).eq('tenant_id', tenantData.id).eq('is_active', true),
        supabase.from('customers').select('*', { count: 'exact' }).eq('tenant_id', tenantData.id)
      ]);

      setStats({
        orders_today: ordersToday.count || 0,
        orders_total: ordersTotal.count || 0,
        revenue_month: 0, // Calcular depois
        products_active: productsActive.count || 0,
        customers_total: customersTotal.count || 0
      });

    } catch (error) {
      console.error('Error loading tenant data:', error);
      toast.error('Erro ao carregar dados da empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(`/empresa/${tenantSlug}/login`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">
          <div className="space-y-6">
            <div className="h-8 bg-muted animate-pulse rounded" />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tenant || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Acesso Negado</h3>
            <p className="text-muted-foreground mb-4">
              Você não tem acesso a esta empresa.
            </p>
            <Button onClick={() => navigate(`/empresa/${tenantSlug}/login`)}>
              Fazer Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">{tenant.name}</h1>
                <Badge variant="secondary">{tenant.slug}</Badge>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden md:inline">
                {user.email}
              </span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pedidos Hoje</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.orders_today}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Produtos Ativos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.products_active}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.customers_total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Pedidos</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.orders_total}</div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
            <CardDescription>
              Acesse rapidamente as principais funcionalidades
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-2"
                onClick={() => navigate(`/empresa/${tenantSlug}/produtos`)}
              >
                <Package className="h-6 w-6" />
                <span>Gerenciar Produtos</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-2"
                onClick={() => navigate(`/empresa/${tenantSlug}/pedidos`)}
              >
                <ShoppingCart className="h-6 w-6" />
                <span>Ver Pedidos</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-2"
                onClick={() => navigate(`/empresa/${tenantSlug}/clientes`)}
              >
                <Users className="h-6 w-6" />
                <span>Clientes</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-2"
                onClick={() => navigate(`/empresa/${tenantSlug}/integrations`)}
              >
                <Settings className="h-6 w-6" />
                <span>Integrações</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-2"
                onClick={() => navigate(`/empresa/${tenantSlug}/whatsapp`)}
              >
                <MessageCircle className="h-6 w-6" />
                <span>WhatsApp</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-2"
                onClick={() => navigate(`/empresa/${tenantSlug}/config`)}
              >
                <CreditCard className="h-6 w-6" />
                <span>Configurações</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}