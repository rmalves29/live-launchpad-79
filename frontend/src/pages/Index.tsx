import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, List, Dice6, Settings, Plus, CreditCard, Truck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState({
    mercadoPago: { active: false, loading: true },
    melhorEnvio: { active: false, loading: true }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const checkIntegrations = async () => {
      try {
        // Check Mercado Pago integration
        const { data: mpData, error: mpError } = await supabase
          .from('payment_integrations')
          .select('is_active')
          .eq('provider', 'mercado_pago')
          .eq('is_active', true)
          .maybeSingle();

        // Check Melhor Envio integration
        const { data: meData, error: meError } = await supabase
          .from('shipping_integrations')
          .select('is_active')
          .eq('provider', 'melhor_envio')
          .eq('is_active', true)
          .maybeSingle();

        setIntegrationStatus({
          mercadoPago: { 
            active: !mpError && mpData?.is_active === true, 
            loading: false 
          },
          melhorEnvio: { 
            active: !meError && meData?.is_active === true, 
            loading: false 
          }
        });
      } catch (error) {
        console.error('Error checking integrations:', error);
        setIntegrationStatus({
          mercadoPago: { active: false, loading: false },
          melhorEnvio: { active: false, loading: false }
        });
      }
    };

    checkIntegrations();
  }, []);

  const dashboardItems = [
    {
      title: 'Pedidos Manual',
      description: 'Lançar vendas manualmente por produto',
      icon: Plus,
      path: '/pedidos-manual',
      color: 'text-blue-600'
    },
    {
      title: 'Checkout',
      description: 'Finalizar pedidos com frete e pagamento',
      icon: ShoppingCart,
      path: '/checkout',
      color: 'text-green-600'
    },
    {
      title: 'Produtos',
      description: 'Cadastrar e gerenciar produtos',
      icon: Package,
      path: '/produtos',
      color: 'text-orange-600'
    },
    {
      title: 'Pedidos',
      description: 'Gerenciar todos os pedidos do sistema',
      icon: List,
      path: '/pedidos',
      color: 'text-purple-600'
    },
    {
      title: 'Sorteio',
      description: 'Sortear entre pedidos pagos',
      icon: Dice6,
      path: '/sorteio',
      color: 'text-yellow-600'
    },
    {
      title: 'Configurações',
      description: 'Configurações do sistema e integrações',
      icon: Settings,
      path: '/config',
      color: 'text-gray-600'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto py-8 max-w-6xl">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-4">Sistema de Vendas</h2>
          <p className="text-xl text-muted-foreground">Sistema operacional para lançamento de pedidos</p>
          {!user && (
            <div className="mt-4">
              <Button onClick={() => navigate('/auth')}>Entrar</Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboardItems
            .filter((item) => !(item.path === '/config' && user?.email !== 'rmalves21@hotmail.com'))
            .map((item) => (
            <Card 
              key={item.path}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(item.path)}
            >
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <item.icon className={`h-12 w-12 ${item.color}`} />
                </div>
                <CardTitle className="text-xl">{item.title}</CardTitle>
                <CardDescription className="text-sm">
                  {item.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Acessar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-center">
                <Package className="h-6 w-6 mr-2" />
                Status do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="font-medium text-green-600">✓ Database</div>
                <div className="text-muted-foreground">Conectado</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-green-600">✓ API</div>
                <div className="text-muted-foreground">Operacional</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <CreditCard className="h-4 w-4 mr-1" />
                  <div className={`font-medium ${
                    integrationStatus.mercadoPago.loading ? 'text-yellow-600' : 
                    integrationStatus.mercadoPago.active ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {integrationStatus.mercadoPago.loading ? '⏳' : 
                     integrationStatus.mercadoPago.active ? '✓' : '✗'} Mercado Pago
                  </div>
                </div>
                <div className="text-muted-foreground">
                  {integrationStatus.mercadoPago.loading ? 'Verificando...' : 
                   integrationStatus.mercadoPago.active ? 'Ativo' : 'Inativo'}
                </div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <Truck className="h-4 w-4 mr-1" />
                  <div className={`font-medium ${
                    integrationStatus.melhorEnvio.loading ? 'text-yellow-600' : 
                    integrationStatus.melhorEnvio.active ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {integrationStatus.melhorEnvio.loading ? '⏳' : 
                     integrationStatus.melhorEnvio.active ? '✓' : '✗'} Melhor Envio
                  </div>
                </div>
                <div className="text-muted-foreground">
                  {integrationStatus.melhorEnvio.loading ? 'Verificando...' : 
                   integrationStatus.melhorEnvio.active ? 'Ativo' : 'Inativo'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Index;
