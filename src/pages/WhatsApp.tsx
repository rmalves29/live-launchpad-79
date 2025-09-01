import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Bot, Settings, BarChart3, Smartphone, MonitorSpeaker, Link, Users } from 'lucide-react';
import WhatsAppMonitor from '@/components/WhatsAppMonitor';

const WhatsApp = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'dashboard' | 'monitor'>('dashboard');

  const dashboardItems = [
    {
      title: 'Monitor de Mensagens',
      description: 'Monitore mensagens em tempo real e crie pedidos automaticamente',
      icon: MonitorSpeaker,
      path: '',
      action: () => setActiveView('monitor'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      title: 'Conexão WhatsApp',
      description: 'Configure e teste conexões com WhatsApp',
      icon: Smartphone,
      path: '/whatsapp-connection',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      title: 'Integração Avançada',
      description: 'Configurações avançadas de integração WhatsApp',
      icon: Link,
      path: '/whatsapp-integration',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    },
    {
      title: 'Templates de Mensagens',
      description: 'Gerencie templates de mensagens automáticas',
      icon: MessageSquare,
      path: '/whatsapp-templates',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    }
  ];

  const statisticsCards = [
    {
      title: 'Mensagens Hoje',
      value: '0',
      description: 'Mensagens processadas hoje',
      icon: MessageSquare,
      color: 'text-blue-600'
    },
    {
      title: 'Status do Servidor',
      value: 'Offline',
      description: 'Status da conexão WhatsApp',
      icon: Bot,
      color: 'text-red-600'
    },
    {
      title: 'Pedidos Criados',
      value: '0',
      description: 'Pedidos automáticos hoje',
      icon: BarChart3,
      color: 'text-green-600'
    },
    {
      title: 'Clientes Ativos',
      value: '0',
      description: 'Clientes que enviaram mensagens',
      icon: Users,
      color: 'text-purple-600'
    }
  ];

  const handleCardClick = (item: any) => {
    if (item.action) {
      item.action();
    } else if (item.path) {
      navigate(item.path);
    }
  };

  if (activeView === 'monitor') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <MonitorSpeaker className="h-8 w-8 mr-3 text-primary" />
                Monitor WhatsApp
              </h1>
              <p className="text-muted-foreground mt-2">
                Monitore mensagens em tempo real e gerencie pedidos automáticos
              </p>
            </div>
            <Button 
              onClick={() => setActiveView('dashboard')} 
              variant="outline"
            >
              <Settings className="h-4 w-4 mr-2" />
              Voltar ao Dashboard
            </Button>
          </div>
          
          <WhatsAppMonitor />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center">
            <MessageSquare className="h-10 w-10 mr-3 text-primary" />
            Centro de Controle WhatsApp
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Gerencie todas as funcionalidades de integração WhatsApp do sistema
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statisticsCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Main Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {dashboardItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card 
                key={item.title} 
                className={`cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 ${item.borderColor} ${item.bgColor} border-2`}
                onClick={() => handleCardClick(item)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center text-xl">
                    <div className={`p-3 rounded-lg ${item.bgColor} mr-4`}>
                      <Icon className={`h-8 w-8 ${item.color}`} />
                    </div>
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {item.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Status Section */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bot className="h-5 w-5 mr-2" />
                Status do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Badge variant="destructive">Servidor WhatsApp</Badge>
                  <span className="text-sm text-muted-foreground">Offline</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Monitoramento</Badge>
                  <span className="text-sm text-muted-foreground">Pausado</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Templates</Badge>
                  <span className="text-sm text-muted-foreground">Configurado</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WhatsApp;