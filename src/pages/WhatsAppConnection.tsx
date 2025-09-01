import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, MessageCircle, Send, CreditCard, Package, Settings, ArrowLeft } from 'lucide-react';
import WhatsAppConnection from '@/components/WhatsAppConnection';

const WhatsAppConnectionPage = () => {
  const [activeView, setActiveView] = useState<'dashboard' | 'connection'>('dashboard');

  const connectionFeatures = [
    {
      title: 'Envio de Mensagens',
      description: 'Envie mensagens de produtos, cobranças e cancelamentos',
      icon: Send,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      stats: { sent: 0, pending: 0, failed: 0 }
    },
    {
      title: 'Mensagens de Produto',
      description: 'Notificações automáticas quando produtos são adicionados',
      icon: Package,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      stats: { sent: 0, pending: 0, failed: 0 }
    },
    {
      title: 'Cobranças WhatsApp',
      description: 'Envie links de pagamento e cobranças via WhatsApp',
      icon: CreditCard,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      stats: { sent: 0, pending: 0, failed: 0 }
    },
    {
      title: 'Pedidos Manuais',
      description: 'Processe pedidos recebidos via mensagem manual',
      icon: MessageCircle,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      stats: { processed: 0, pending: 0, errors: 0 }
    }
  ];

  if (activeView === 'connection') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <Smartphone className="h-8 w-8 mr-3 text-primary" />
                Conexão WhatsApp
              </h1>
              <p className="text-muted-foreground mt-2">
                Gerencie conexões e envie mensagens via WhatsApp
              </p>
            </div>
            <Button 
              onClick={() => setActiveView('dashboard')} 
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Dashboard
            </Button>
          </div>
          
          <WhatsAppConnection />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center">
            <Smartphone className="h-10 w-10 mr-3 text-primary" />
            Conexão WhatsApp
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Gerencie conexões, envie mensagens e processe pedidos via WhatsApp
          </p>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Status da Conexão
              </CardTitle>
              <Smartphone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Desconectado</div>
              <p className="text-xs text-muted-foreground">
                Configure a conexão WhatsApp
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mensagens Hoje
              </CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                Total de mensagens enviadas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Taxa de Sucesso
              </CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">
                Mensagens entregues com sucesso
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {connectionFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card 
                key={feature.title}
                className="hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <div className={`p-3 rounded-lg ${feature.bgColor} mr-4`}>
                      <Icon className={`h-6 w-6 ${feature.color}`} />
                    </div>
                    {feature.title}
                  </CardTitle>
                  <CardDescription>
                    {feature.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-green-600">
                        {Object.values(feature.stats)[0]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Object.keys(feature.stats)[0]}
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-yellow-600">
                        {Object.values(feature.stats)[1]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Object.keys(feature.stats)[1]}
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-red-600">
                        {Object.values(feature.stats)[2]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Object.keys(feature.stats)[2]}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Configurar Conexão
              </CardTitle>
              <CardDescription>
                Configure e teste a conexão com o WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={() => setActiveView('connection')}
              >
                Acessar Configurações
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageCircle className="h-5 w-5 mr-2" />
                Histórico de Mensagens
              </CardTitle>
              <CardDescription>
                Visualize todas as mensagens enviadas e recebidas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setActiveView('connection')}
              >
                Ver Histórico
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConnectionPage;