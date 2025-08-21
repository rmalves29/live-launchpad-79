import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ExternalLink, Settings, Database, Truck, CreditCard, MessageSquare } from 'lucide-react';

interface SystemConfig {
  event_date: string;
  event_type: string;
  origin_cep: string;
  supabase_url: string;
  supabase_anon_key: string;
}

const Config = () => {
  const [config, setConfig] = useState<SystemConfig | null>(null);

  useEffect(() => {
    // Mock configuration data - in real implementation, this would come from backend
    const mockConfig: SystemConfig = {
      event_date: '2025-08-16',
      event_type: 'BAZAR',
      origin_cep: '31575-060',
      supabase_url: 'https://hxtbsieodbtzgcvvkeqx.supabase.co',
      supabase_anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    };
    
    setConfig(mockConfig);
  }, []);

  const configSections = [
    {
      title: 'Configurações do Evento',
      icon: Settings,
      items: [
        { label: 'Data do Evento', value: config?.event_date, type: 'date' },
        { label: 'Tipo do Evento', value: config?.event_type, type: 'badge' }
      ]
    },
    {
      title: 'Melhor Envio',
      icon: Truck,
      items: [
        { label: 'CEP de Origem', value: config?.origin_cep, type: 'text' },
        { label: 'Ambiente', value: 'Sandbox', type: 'badge' },
        { label: 'Status OAuth', value: 'Configurar', type: 'status' }
      ]
    },
    {
      title: 'Configurações do Supabase',
      icon: Database,
      items: [
        { label: 'URL do Projeto', value: config?.supabase_url, type: 'url' },
        { label: 'Chave Anônima', value: config?.supabase_anon_key, type: 'secret' }
      ]
    }
  ];

  const integrationDocs = [
    {
      title: 'Mercado Pago',
      description: 'Configuração de pagamentos e webhooks',
      icon: CreditCard,
      url: 'https://www.mercadopago.com.br/developers',
      status: 'Configuração necessária'
    },
    {
      title: 'Melhor Envio',
      description: 'Cálculo de frete e geração de etiquetas',
      icon: Truck,
      url: 'https://docs.melhorenvio.com.br/',
      status: 'Configuração necessária'
    },
    {
      title: 'WhatsApp (WPPConnect)',
      description: 'Captura automática de comentários',
      icon: MessageSquare,
      url: 'https://wppconnect.io/',
      status: 'Externo ao Lovable'
    }
  ];

  const envVariables = [
    { name: 'GROUP_ID', description: 'ID do grupo WhatsApp para captura' },
    { name: 'EVENT_TYPE', description: 'Tipo padrão do evento (BAZAR/LIVE)' },
    { name: 'EVENT_DATE', description: 'Data padrão do evento (YYYY-MM-DD)' },
    { name: 'MP_ACCESS_TOKEN', description: 'Token de acesso do Mercado Pago' },
    { name: 'PUBLIC_BASE_URL', description: 'URL base para callbacks' },
    { name: 'CORREIOS_ORIGIN_CEP', description: 'CEP de origem para cálculo de frete' },
    { name: 'CORREIOS_COMPANY_CODE', description: 'Código da empresa nos Correios' },
    { name: 'CORREIOS_PASSWORD', description: 'Senha dos Correios' },
    { name: 'CORREIOS_SERVICE_PAC', description: 'Código do serviço PAC' },
    { name: 'CORREIOS_SERVICE_SEDEX', description: 'Código do serviço SEDEX' },
    { name: 'DEFAULT_WEIGHT_KG', description: 'Peso padrão dos produtos (kg)' },
    { name: 'DEFAULT_LENGTH_CM', description: 'Comprimento padrão (cm)' },
    { name: 'DEFAULT_HEIGHT_CM', description: 'Altura padrão (cm)' },
    { name: 'DEFAULT_WIDTH_CM', description: 'Largura padrão (cm)' },
    { name: 'DEFAULT_DIAMETER_CM', description: 'Diâmetro padrão (cm)' }
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

  return (
    <div className="container mx-auto py-6 max-w-6xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center">
          <Settings className="h-8 w-8 mr-3" />
          Configurações do Sistema
        </h1>
      </div>

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

      {/* Environment Variables Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Variáveis de Ambiente (Backend)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-4">
            As seguintes variáveis devem ser configuradas no arquivo <code>.env</code> do backend Node.js:
          </div>
          
          <div className="space-y-4">
            {['WhatsApp', 'Evento', 'Supabase', 'Mercado Pago', 'Correios', 'Dimensões Padrão'].map((category) => (
              <div key={category}>
                <h4 className="font-medium mb-2 text-primary">{category}</h4>
                <div className="space-y-2 ml-4">
                  {envVariables
                    .filter(variable => {
                      switch (category) {
                        case 'WhatsApp': return variable.name.includes('GROUP_ID');
                        case 'Evento': return variable.name.includes('EVENT_');
                        case 'Supabase': return variable.name.includes('SUPABASE_');
                        case 'Mercado Pago': return variable.name.includes('MP_') || variable.name.includes('PUBLIC_BASE_URL');
                        case 'Correios': return variable.name.includes('CORREIOS_');
                        case 'Dimensões Padrão': return variable.name.includes('DEFAULT_');
                        default: return false;
                      }
                    })
                    .map((variable) => (
                      <div key={variable.name} className="flex flex-col space-y-1">
                        <code className="text-sm bg-muted px-2 py-1 rounded font-mono w-fit">
                          {variable.name}
                        </code>
                        <span className="text-xs text-muted-foreground">
                          {variable.description}
                        </span>
                      </div>
                    ))}
                </div>
                <Separator className="my-3" />
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <div className="text-sm">
              <strong>Nota:</strong> Essas configurações são gerenciadas no backend Node.js que 
              já está fornecido. O frontend Lovable consome os dados através das APIs REST.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Config;