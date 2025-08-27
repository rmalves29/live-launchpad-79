import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, List, Dice6, Settings, Plus } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();

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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboardItems.map((item) => (
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
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-center">
                <div className="font-medium text-green-600">✓ Database</div>
                <div className="text-muted-foreground">Conectado</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-green-600">✓ API</div>
                <div className="text-muted-foreground">Operacional</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Index;
