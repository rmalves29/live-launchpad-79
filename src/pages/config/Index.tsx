import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Settings, Truck, CreditCard, MessageSquare, Percent, Gift, Building2, Users, Printer, FolderTree } from 'lucide-react';
import { CouponsManager } from '@/components/CouponsManager';
import { GiftsManager } from '@/components/GiftsManager';
import PromocoesManager from '@/components/PromocoesManager';
import CategoriasManager from '@/components/CategoriasManager';
import { CompanySettings } from '@/components/CompanySettings';
import { MelhorEnvioStatus } from '@/components/MelhorEnvioStatus';
import { WhatsAppSettings } from '@/components/WhatsAppSettings';
import { WhatsAppGroupsManager } from '@/components/WhatsAppGroupsManager';
import TenantsManager from '@/components/TenantsManager';
import { AvailabilitySettings } from '@/components/AvailabilitySettings';
import { TenantSimulator } from '@/components/TenantSimulator';
import IntegrationsChecklist from '@/components/IntegrationsChecklist';
import { ShippingOptionsManager } from '@/components/ShippingOptionsManager';
import { PrinterSettings } from '@/components/PrinterSettings';
import { useToast } from '@/hooks/use-toast';
import { formatBrasiliaDate } from '@/lib/date-utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  const { user, isLoading, isSuperAdmin } = useAuth();

  const isMaster = isSuperAdmin;
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [mercadoPagoIntegration, setMercadoPagoIntegration] = useState<MercadoPagoIntegration | null>(null);
  const [melhorEnvioIntegration, setMelhorEnvioIntegration] = useState<MelhorEnvioIntegration | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
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
    } catch (error: any) {
      console.error('Error loading settings:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar configurações',
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
        return formatBrasiliaDate(value);
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

  const tabTriggerClass =
    "flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-slate-500 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent hover:text-[#4f46e5] data-[state=active]:text-[#4f46e5] data-[state=active]:border-[#4f46e5] data-[state=active]:shadow-none transition-colors";

  return (
      <div className="min-h-screen bg-white">
        <div className="px-8 pt-7">
          <div className="flex items-center gap-3 mb-1.5">
            <Settings className="h-7 w-7 text-[#4f46e5]" />
            <h1 className="text-[24px] font-bold text-slate-900">Configurações do Sistema</h1>
          </div>
          <p className="text-slate-500 text-[13px] mb-5">
            Configure integrações, cupons, brindes e parâmetros do sistema
          </p>
        </div>

        <Tabs defaultValue={searchParams.get('tab') || (isMaster ? 'config' : 'company')} className="w-full">
          <div className="border-b border-slate-200 px-8 sticky top-0 bg-white z-10 overflow-x-auto">
            <TabsList className="h-auto p-0 bg-transparent rounded-none gap-0 justify-start">
              {isMaster && (
                <TabsTrigger value="config" className={tabTriggerClass}>
                  <Settings className="h-3.5 w-3.5" />
                  Configurações
                </TabsTrigger>
              )}
              <TabsTrigger value="company" className={tabTriggerClass}>
                <Building2 className="h-3.5 w-3.5" />
                Empresa
              </TabsTrigger>
              <TabsTrigger value="shipping" className={tabTriggerClass}>
                <Truck className="h-3.5 w-3.5" />
                Frete
              </TabsTrigger>
              <TabsTrigger value="groups" className={tabTriggerClass}>
                <Users className="h-3.5 w-3.5" />
                Grupos
              </TabsTrigger>
              <TabsTrigger value="coupons" className={tabTriggerClass}>
                <Percent className="h-3.5 w-3.5" />
                Cupons
              </TabsTrigger>
              <TabsTrigger value="gifts" className={tabTriggerClass}>
                <Gift className="h-3.5 w-3.5" />
                Brindes
              </TabsTrigger>
              <TabsTrigger value="promocoes" className={tabTriggerClass}>
                <Percent className="h-3.5 w-3.5" />
                Promoções
              </TabsTrigger>
              <TabsTrigger value="printer" className={tabTriggerClass}>
                <Printer className="h-3.5 w-3.5" />
                Impressora
              </TabsTrigger>
              {isMaster && (
                <TabsTrigger value="tenants" className={tabTriggerClass}>
                  <Building2 className="h-3.5 w-3.5" />
                  Empresas
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="px-8 py-6">

              {isMaster && (
                <TabsContent value="config" className="space-y-6 mt-6">
                  {/* Integrations Checklist */}
                  <IntegrationsChecklist />
                  
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
              )}

              <TabsContent value="company" className="space-y-6 mt-6">
                <CompanySettings />
              </TabsContent>

              <TabsContent value="shipping" className="space-y-6 mt-6">
                <ShippingOptionsManager />
              </TabsContent>

              <TabsContent value="groups" className="space-y-6 mt-6">
                <WhatsAppGroupsManager />
              </TabsContent>

              <TabsContent value="coupons" className="space-y-6 mt-6">
                <CouponsManager />
              </TabsContent>

              <TabsContent value="gifts" className="space-y-6 mt-6">
                <GiftsManager />
              </TabsContent>

              <TabsContent value="promocoes" className="space-y-6 mt-6">
                <PromocoesManager />
              </TabsContent>

              <TabsContent value="printer" className="space-y-6 mt-6">
                <PrinterSettings />
              </TabsContent>

              {isMaster && (
                <TabsContent value="tenants" className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TenantsManager />
                    <TenantSimulator />
                  </div>
                </TabsContent>
              )}
          </div>
        </Tabs>
      </div>
  );
};

export default Config;
