import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Settings, Truck, CreditCard, MessageSquare, Percent, Gift, ArrowLeft, BarChart3, TrendingUp, Building2 } from 'lucide-react';
import { CouponsManager } from '@/components/CouponsManager';
import { GiftsManager } from '@/components/GiftsManager';
import { CompanySettings } from '@/components/CompanySettings';
import { MelhorEnvioStatus } from '@/components/MelhorEnvioStatus';
import { WhatsAppSettings } from '@/components/WhatsAppSettings';
import TenantsManager from '@/components/TenantsManager';
import { AvailabilitySettings } from '@/components/AvailabilitySettings';
import { TenantSimulator } from '@/components/TenantSimulator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

interface SystemConfig {
  event_date: string;
  event_type: string;
  origin_cep: string;
  handling_days: number;
}

interface MercadoPagoIntegration {
  access_token: string;
  client_id: string;
  client_secret: string;
  public_key: string;
  is_active: boolean;
}

interface MelhorEnvioIntegration {
  client_id: string;
  client_secret: string;
  access_token: string;
  from_cep: string;
  sandbox: boolean;
  is_active: boolean;
}

const Config = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const isMaster = user?.email === 'rmalves21@hotmail.com';
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [mercadoPagoIntegration, setMercadoPagoIntegration] = useState<MercadoPagoIntegration | null>(null);
  const [melhorEnvioIntegration, setMelhorEnvioIntegration] = useState<MelhorEnvioIntegration | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  // Se houver um query param 'tab', já inicia na view de config
  const [activeView, setActiveView] = useState<'dashboard' | 'config'>(
    searchParams.get('tab') ? 'config' : 'dashboard'
  );
  const [appSettings, setAppSettings] = useState<any>(null);

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      // Load Mercado Pago integration
      const { data: mpData } = await supabase
        .from('integration_mp')
        .select('*')
        .single();

      if (mpData) {
        setMercadoPagoIntegration({
          access_token: mpData.access_token || '',
          client_id: mpData.client_id || '',
          client_secret: mpData.client_secret || '',
          public_key: mpData.public_key || '',
          is_active: mpData.is_active || false
        });
      }

      // Load Melhor Envio integration
      const { data: meData } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('provider', 'melhor_envio')
        .single();

      if (meData) {
        setMelhorEnvioIntegration({
          client_id: meData.client_id || '',
          client_secret: meData.client_secret || '',
          access_token: meData.access_token || '',
          from_cep: meData.from_cep || '31575060',
          sandbox: meData.sandbox || false,
          is_active: meData.is_active || false
        });
      }

      // Load app settings
      const { data: appData } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      if (appData) {
        setAppSettings(appData);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar configurações',
        variant: 'destructive'
      });
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    // Mock configuration data - in real implementation, this would come from backend
    const mockConfig: SystemConfig = {
      event_date: '2025-08-16',
      event_type: 'BAZAR',
      origin_cep: '31575-060',
      handling_days: appSettings?.handling_days || 3
    };
    
    setConfig(mockConfig);
    loadSettings();
  }, []);

  const configSections = [
    {
      title: 'Configurações do Evento',
      icon: Settings,
      items: [
        { label: 'Data do Evento', value: config?.event_date, type: 'date' },
        { label: 'Tipo do Evento', value: config?.event_type, type: 'badge' },
        { label: 'Disponibilidade', value: config?.handling_days ? `${config.handling_days} dias` : '3 dias', type: 'text' }
      ]
    },
    {
      title: 'Melhor Envio',
      icon: Truck,
      items: [
        { label: 'CEP de Origem', value: melhorEnvioIntegration?.from_cep, type: 'text' },
        { label: 'Ambiente', value: melhorEnvioIntegration?.sandbox ? 'Sandbox' : 'Produção', type: 'badge' },
        { label: 'Status', value: melhorEnvioIntegration?.is_active ? 'Ativo' : 'Inativo', type: 'status' }
      ]
    },
    {
      title: 'Mercado Pago',
      icon: CreditCard,
      items: [
        { label: 'Public Key', value: mercadoPagoIntegration?.public_key, type: 'secret' },
        { label: 'Status', value: mercadoPagoIntegration?.is_active ? 'Ativo' : 'Inativo', type: 'status' }
      ]
    }
  ];

  const integrationDocs = [
    {
      title: 'Mercado Pago',
      description: 'Configuração de pagamentos e webhooks',
      icon: CreditCard,
      url: 'https://www.mercadopago.com.br/developers',
      status: mercadoPagoIntegration?.is_active ? 'Configurado' : 'Configuração necessária'
    },
    {
      title: 'Melhor Envio',
      description: 'Cálculo de frete e geração de etiquetas',
      icon: Truck,
      url: 'https://docs.melhorenvio.com.br/',
      status: melhorEnvioIntegration?.is_active ? 'Configurado' : 'Configuração necessária'
    },
    {
      title: 'WhatsApp (WPPConnect)',
      description: 'Captura automática de comentários',
      icon: MessageSquare,
      url: 'https://wppconnect.io/',
      status: 'Externo ao Lovable'
    }
  ];

  const formatValue = (value: string | undefined, type: string) => {
    if (!value) return 'Não configurado';

    switch (type) {
      case 'date':
        return new Date(value).toLocaleDateString('pt-BR');
      case 'badge':
        return <Badge variant="outline">{value}</Badge>;
      case 'url':
        return (
          <a 
            href={value} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center"
          >
            {value.replace('https://', '')}
            <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        );
      case 'secret':
        return `${value.substring(0, 20)}...`;
      case 'code':
        return <Badge variant="secondary" className="font-mono">{value}</Badge>;
      case 'status':
        return <Badge variant="outline">{value}</Badge>;
      default:
        return value;
    }
  };

  if (activeView === 'config') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <Settings className="h-8 w-8 mr-3 text-primary" />
                Configurações do Sistema
              </h1>
              <p className="text-muted-foreground mt-2">
                Configure integrações, cupons, brindes e parâmetros do sistema
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

          <div className="space-y-6">
            <Tabs defaultValue={searchParams.get('tab') || 'config'} className="w-full">
              <TabsList className={`grid w-full ${isMaster ? 'grid-cols-5' : 'grid-cols-4'}`}>
                <TabsTrigger value="config" className="flex items-center">
                  <Settings className="h-4 w-4 mr-2" />
                  Configurações
                </TabsTrigger>
                <TabsTrigger value="company" className="flex items-center">
                  <Building2 className="h-4 w-4 mr-2" />
                  Empresa
                </TabsTrigger>
                <TabsTrigger value="coupons" className="flex items-center">
                  <Percent className="h-4 w-4 mr-2" />
                  Cupons
                </TabsTrigger>
                <TabsTrigger value="gifts" className="flex items-center">
                  <Gift className="h-4 w-4 mr-2" />
                  Brindes
                </TabsTrigger>
                {isMaster && (
                  <TabsTrigger value="tenants" className="flex items-center">
                    Empresas
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="config" className="space-y-6 mt-6">
                {/* WhatsApp Settings */}
                <WhatsAppSettings />
                
                {/* Status do Melhor Envio */}
                <MelhorEnvioStatus />
                
                {/* Availability Settings */}
                <AvailabilitySettings />
                
                {/* Current Configuration */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {configSections.map((section) => (
                    <Card key={section.title}>
                      <CardHeader>
                        <CardTitle className="flex items-center text-lg">
                          <section.icon className="h-5 w-5 mr-2" />
                          {section.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {section.items.map((item) => (
                            <div key={item.label}>
                              <div className="text-sm font-medium text-muted-foreground mb-1">
                                {item.label}
                              </div>
                              <div className="text-sm">
                                {formatValue(item.value, item.type)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Integration Status */}
                <Card>
                  <CardHeader>
                    <CardTitle>Status das Integrações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {integrationDocs.map((integration) => (
                        <div 
                          key={integration.title}
                          className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center space-x-3 mb-2">
                            <integration.icon className="h-5 w-5 text-primary" />
                            <div className="font-medium">{integration.title}</div>
                          </div>
                          <div className="text-sm text-muted-foreground mb-3">
                            {integration.description}
                          </div>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              {integration.status}
                            </Badge>
                            <Button asChild size="sm" variant="ghost">
                              <a 
                                href={integration.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center"
                              >
                                Docs
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="company" className="space-y-6 mt-6">
                <CompanySettings />
              </TabsContent>

              <TabsContent value="coupons" className="space-y-6 mt-6">
                <CouponsManager />
              </TabsContent>

              <TabsContent value="gifts" className="space-y-6 mt-6">
                <GiftsManager />
              </TabsContent>

              {isMaster && (
                <TabsContent value="tenants" className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TenantsManager />
                    <TenantSimulator />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Acesso Negado</h1>
          <p className="text-muted-foreground">Você precisa estar logado para acessar esta página.</p>
        </div>
      </div>
    );
  }

  // Dashboard view
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <Settings className="h-8 w-8 mr-3 text-primary" />
              Dashboard de Configurações
            </h1>
            <p className="text-muted-foreground mt-2">
              Visão geral do sistema e configurações
            </p>
          </div>
          <Button onClick={() => setActiveView('config')}>
            <Settings className="h-4 w-4 mr-2" />
            Configurações Detalhadas
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Mercado Pago</p>
                  <p className="text-2xl font-bold">
                    {mercadoPagoIntegration?.is_active ? 'Ativo' : 'Inativo'}
                  </p>
                </div>
                <CreditCard className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Melhor Envio</p>
                  <p className="text-2xl font-bold">
                    {melhorEnvioIntegration?.is_active ? 'Ativo' : 'Inativo'}
                  </p>
                </div>
                <Truck className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Cupons</p>
                  <p className="text-2xl font-bold">-</p>
                </div>
                <Percent className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Brindes</p>
                  <p className="text-2xl font-bold">-</p>
                </div>
                <Gift className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" 
                onClick={() => window.location.href = '/config?tab=config'}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Configurações Gerais
              </CardTitle>
              <CardDescription>
                Configure integrações e parâmetros do sistema
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => window.location.href = '/config?tab=company'}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building2 className="h-5 w-5 mr-2" />
                Dados da Empresa
              </CardTitle>
              <CardDescription>
                Gerencie informações da sua empresa
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => window.location.href = '/config?tab=coupons'}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Percent className="h-5 w-5 mr-2" />
                Cupons de Desconto
              </CardTitle>
              <CardDescription>
                Crie e gerencie cupons promocionais
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => window.location.href = '/config?tab=gifts'}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Gift className="h-5 w-5 mr-2" />
                Brindes
              </CardTitle>
              <CardDescription>
                Configure brindes por valor de compra
              </CardDescription>
            </CardHeader>
          </Card>

          {isMaster && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.location.href = '/config?tab=tenants'}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  Gerenciar Empresas
                </CardTitle>
                <CardDescription>
                  Administre empresas do sistema (Master)
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Config;
