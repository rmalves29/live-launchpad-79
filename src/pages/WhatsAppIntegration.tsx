import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link, Settings, Smartphone, Bot, Server, ArrowLeft, Zap, Shield, Cpu } from 'lucide-react';
import WhatsAppIntegration from '@/components/WhatsAppIntegration';

const WhatsAppIntegrationPage = () => {
  const [activeView, setActiveView] = useState<'dashboard' | 'integration'>('dashboard');

  const integrationFeatures = [
    {
      title: 'Servidor Node.js',
      description: 'Configure e monitore o servidor WhatsApp local',
      icon: Server,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      status: 'Offline',
      details: 'Servidor não detectado'
    },
    {
      title: 'Autenticação QR',
      description: 'Sistema de autenticação via QR Code do WhatsApp',
      icon: Shield,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      status: 'Pendente',
      details: 'QR Code necessário'
    },
    {
      title: 'Processamento Automático',
      description: 'IA para detectar e processar pedidos em mensagens',
      icon: Bot,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      status: 'Configurado',
      details: 'Padrões de texto ativos'
    },
    {
      title: 'Performance',
      description: 'Monitoramento de performance e estatísticas',
      icon: Cpu,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      status: 'Monitorando',
      details: '0 msg/min processadas'
    }
  ];

  const quickStats = [
    { label: 'Uptime do Servidor', value: '0h 0m', color: 'text-red-600' },
    { label: 'Mensagens Processadas', value: '0', color: 'text-blue-600' },
    { label: 'Pedidos Automáticos', value: '0', color: 'text-green-600' },
    { label: 'Taxa de Erro', value: '0%', color: 'text-yellow-600' }
  ];

  if (activeView === 'integration') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <Link className="h-8 w-8 mr-3 text-primary" />
                Integração WhatsApp
              </h1>
              <p className="text-muted-foreground mt-2">
                Configurações avançadas de integração com WhatsApp
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
          
          <WhatsAppIntegration />
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
            <Link className="h-10 w-10 mr-3 text-primary" />
            Integração WhatsApp
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Configure e monitore a integração avançada com WhatsApp para automação completa
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {quickStats.map((stat, index) => (
            <Card key={index}>
              <CardContent className="p-4 text-center">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Integration Status */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Zap className="h-5 w-5 mr-2" />
                  Status da Integração
                </span>
                <Badge variant="secondary">Sistema Inativo</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {integrationFeatures.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div key={feature.title} className="text-center">
                      <div className={`p-3 rounded-lg ${feature.bgColor} mx-auto w-fit mb-2`}>
                        <Icon className={`h-6 w-6 ${feature.color}`} />
                      </div>
                      <h3 className="font-semibold text-sm">{feature.title}</h3>
                      <Badge 
                        variant={feature.status === 'Offline' ? 'destructive' : 
                               feature.status === 'Pendente' ? 'secondary' : 'outline'}
                        className="text-xs mt-1"
                      >
                        {feature.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{feature.details}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {integrationFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <div className={`p-3 rounded-lg ${feature.bgColor} mr-4`}>
                      <Icon className={`h-6 w-6 ${feature.color}`} />
                    </div>
                    <div>
                      <div>{feature.title}</div>
                      <div className="text-sm font-normal text-muted-foreground">
                        {feature.details}
                      </div>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Configurar Integração
              </CardTitle>
              <CardDescription>
                Configure servidor Node.js e autenticação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={() => setActiveView('integration')}
              >
                Configurar Agora
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bot className="h-5 w-5 mr-2" />
                Ver Instruções
              </CardTitle>
              <CardDescription>
                Guia completo de instalação do servidor
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setActiveView('integration')}
              >
                Ver Guia
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Smartphone className="h-5 w-5 mr-2" />
                Testar Conexão
              </CardTitle>
              <CardDescription>
                Teste a conexão com WhatsApp Web
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setActiveView('integration')}
              >
                Testar Agora
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppIntegrationPage;