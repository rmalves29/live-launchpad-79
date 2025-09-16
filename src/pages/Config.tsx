import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Settings, Database, Truck, CreditCard, MessageSquare, Percent, Gift, Save, Edit, Package, ArrowLeft, BarChart3, TrendingUp, Eye, EyeOff, Building2 } from 'lucide-react';
import { CouponsManager } from '@/components/CouponsManager';
import { GiftsManager } from '@/components/GiftsManager';
import { CompanySettings } from '@/components/CompanySettings';
import TenantsManager from '@/components/TenantsManager';
import { TenantSimulator } from '@/components/TenantSimulator';
import { TenantIntegrations } from '@/components/tenant/TenantIntegrations';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

interface SystemConfig {
  event_date: string;
  event_type: string;
  origin_cep: string;
  supabase_url: string;
  supabase_anon_key: string;
}

interface AppSettings {
  id: number;
  public_base_url: string;
  melhor_envio_from_cep: string;
  melhor_envio_env: string;
  default_weight_kg: number;
  default_length_cm: number;
  default_height_cm: number;
  default_width_cm: number;
  default_diameter_cm: number;
}

interface IntegrationSettings {
  melhor_envio: {
    client_id: string;
    client_secret: string;
    access_token: string;
    from_cep: string;
    env: string;
  };
  mercado_pago: {
    access_token: string;
    client_id: string;
    client_secret: string;
    public_key: string;
  };
}

const Config = () => {
  const { toast } = useToast();
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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>({
    melhor_envio: {
      client_id: '',
      client_secret: '',
      access_token: '',
      from_cep: '',
      env: 'sandbox'
    },
    mercado_pago: {
      access_token: '',
      client_id: '',
      client_secret: '',
      public_key: ''
    }
  });
  const [isEditing, setIsEditing] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'config'>('dashboard');
  const [showSecrets, setShowSecrets] = useState<{[key: string]: boolean}>({});

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      // Load app settings
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings(data);
      } else {
        // Create default settings
        const defaultSettings = {
          id: 1,
          public_base_url: '',
          melhor_envio_from_cep: '31575060',
          melhor_envio_env: 'sandbox',
          default_weight_kg: 0.3,
          default_length_cm: 20,
          default_height_cm: 2,
          default_width_cm: 16,
          default_diameter_cm: 0
        };
        setSettings(defaultSettings);
      }

      // Load integration settings from Supabase secrets (edge function)
      await loadIntegrationSettings();
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

  const loadIntegrationSettings = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-integration-settings');
      
      if (!error && data) {
        setIntegrationSettings({
          melhor_envio: {
            client_id: data.melhor_envio?.client_id || '',
            client_secret: data.melhor_envio?.client_secret || '',
            access_token: data.melhor_envio?.access_token || '',
            from_cep: data.melhor_envio?.from_cep || '31575060',
            env: data.melhor_envio?.env || 'sandbox'
          },
          mercado_pago: {
            access_token: data.mercado_pago?.access_token || '',
            client_id: data.mercado_pago?.client_id || '',
            client_secret: data.mercado_pago?.client_secret || '',
            public_key: data.mercado_pago?.public_key || ''
          }
        });
      }
    } catch (error) {
      console.error('Error loading integration settings:', error);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      // Save app settings
      const { error } = await supabase
        .from('app_settings')
        .upsert(settings, { onConflict: 'id' });

      if (error) throw error;

      // Save integration settings
      await saveIntegrationSettings();

      toast({
        title: 'Sucesso',
        description: 'Configurações salvas com sucesso'
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configurações',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const saveIntegrationSettings = async () => {
    try {
      const { error } = await supabase.functions.invoke('save-integration-settings', {
        body: integrationSettings
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving integration settings:', error);
      throw error;
    }
  };

  const handleInputChange = (field: keyof AppSettings, value: string | number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleIntegrationChange = (integration: 'melhor_envio' | 'mercado_pago', field: string, value: string) => {
    setIntegrationSettings(prev => ({
      ...prev,
      [integration]: {
        ...prev[integration],
        [field]: value
      }
    }));
  };

  const toggleSecretVisibility = (field: string) => {
    setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }));
  };

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
    loadSettings();
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
    { name: 'MELHOR_ENVIO_ACCESS_TOKEN', description: 'Token de acesso do Melhor Envio' },
    { name: 'MELHOR_ENVIO_FROM_CEP', description: 'CEP de origem para cálculo de frete' },
    { name: 'MELHOR_ENVIO_ENV', description: 'Ambiente do Melhor Envio (sandbox/production)' },
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
          <Tabs defaultValue="config" className="w-full">
            <TabsList className={`grid w-full ${isMaster ? 'grid-cols-7' : 'grid-cols-6'}`}>
              <TabsTrigger value="config" className="flex items-center">
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </TabsTrigger>
              <TabsTrigger value="company" className="flex items-center">
                <Building2 className="h-4 w-4 mr-2" />
                Empresa
              </TabsTrigger>
              <TabsTrigger value="system" className="flex items-center">
                <Database className="h-4 w-4 mr-2" />
                Sistema
              </TabsTrigger>
              <TabsTrigger value="coupons" className="flex items-center">
                <Percent className="h-4 w-4 mr-2" />
                Cupons
              </TabsTrigger>
              <TabsTrigger value="gifts" className="flex items-center">
                <Gift className="h-4 w-4 mr-2" />
                Brindes
              </TabsTrigger>
              <TabsTrigger value="integrations" className="flex items-center">
                <Truck className="h-4 w-4 mr-2" />
                Integrações
              </TabsTrigger>
              {isMaster && (
                <TabsTrigger value="tenants" className="flex items-center">
                  <Package className="h-4 w-4 mr-2" />
                  Empresas
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="config" className="space-y-6 mt-6">

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
            {['WhatsApp', 'Evento', 'Supabase', 'Mercado Pago', 'Melhor Envio', 'Dimensões Padrão'].map((category) => (
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
                        case 'Melhor Envio': return variable.name.includes('MELHOR_ENVIO_');
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
        </TabsContent>

        <TabsContent value="system" className="space-y-6 mt-6">
          {loadingSettings ? (
            <div className="text-center">Carregando configurações...</div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Configurações do Sistema</h2>
                <div className="flex space-x-2">
                  {isEditing ? (
                    <>
                      <Button onClick={() => setIsEditing(false)} variant="outline">
                        Cancelar
                      </Button>
                      <Button onClick={saveSettings} disabled={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  )}
                </div>
              </div>

              {/* Base URL */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Database className="h-5 w-5 mr-2" />
                    URL Base
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="public_base_url">URL Base para Callbacks</Label>
                      <Input
                        id="public_base_url"
                        value={settings?.public_base_url || ''}
                        onChange={(e) => handleInputChange('public_base_url', e.target.value)}
                        disabled={!isEditing}
                        placeholder="https://seu-dominio.com"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        URL usada para callbacks do Mercado Pago
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Melhor Envio Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Truck className="h-5 w-5 mr-2" />
                    Configurações do Melhor Envio
                  </CardTitle>
                  <CardDescription>
                    Configure sua integração com o Melhor Envio para cálculo de frete e geração de etiquetas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="melhor_envio_client_id">Client ID</Label>
                        <Input
                          id="melhor_envio_client_id"
                          value={integrationSettings.melhor_envio.client_id}
                          onChange={(e) => handleIntegrationChange('melhor_envio', 'client_id', e.target.value)}
                          disabled={!isEditing}
                          placeholder="Seu Client ID do Melhor Envio"
                        />
                      </div>
                      <div>
                        <Label htmlFor="melhor_envio_client_secret">Client Secret</Label>
                        <div className="relative">
                          <Input
                            id="melhor_envio_client_secret"
                            type={showSecrets['melhor_envio_client_secret'] ? 'text' : 'password'}
                            value={integrationSettings.melhor_envio.client_secret}
                            onChange={(e) => handleIntegrationChange('melhor_envio', 'client_secret', e.target.value)}
                            disabled={!isEditing}
                            placeholder="Seu Client Secret do Melhor Envio"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => toggleSecretVisibility('melhor_envio_client_secret')}
                          >
                            {showSecrets['melhor_envio_client_secret'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="melhor_envio_access_token">Access Token</Label>
                      <div className="relative">
                        <Input
                          id="melhor_envio_access_token"
                          type={showSecrets['melhor_envio_access_token'] ? 'text' : 'password'}
                          value={integrationSettings.melhor_envio.access_token}
                          onChange={(e) => handleIntegrationChange('melhor_envio', 'access_token', e.target.value)}
                          disabled={!isEditing}
                          placeholder="Token de acesso obtido via OAuth"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => toggleSecretVisibility('melhor_envio_access_token')}
                        >
                          {showSecrets['melhor_envio_access_token'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Token obtido após autorização OAuth no Melhor Envio
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="melhor_envio_from_cep">CEP de Origem</Label>
                        <Input
                          id="melhor_envio_from_cep"
                          value={integrationSettings.melhor_envio.from_cep}
                          onChange={(e) => handleIntegrationChange('melhor_envio', 'from_cep', e.target.value)}
                          disabled={!isEditing}
                          placeholder="31575-060"
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          CEP de onde os produtos serão enviados
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="melhor_envio_env">Ambiente</Label>
                        <select
                          id="melhor_envio_env"
                          value={integrationSettings.melhor_envio.env}
                          onChange={(e) => handleIntegrationChange('melhor_envio', 'env', e.target.value)}
                          disabled={!isEditing}
                          className="w-full p-2 border rounded"
                        >
                          <option value="sandbox">Sandbox (Testes)</option>
                          <option value="production">Produção</option>
                        </select>
                        <p className="text-sm text-muted-foreground mt-1">
                          Use Sandbox para testes e Produção para uso real
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Mercado Pago Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CreditCard className="h-5 w-5 mr-2" />
                    Configurações do Mercado Pago
                  </CardTitle>
                  <CardDescription>
                    Configure sua integração com o Mercado Pago para processamento de pagamentos
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="mp_access_token">Access Token</Label>
                        <div className="relative">
                          <Input
                            id="mp_access_token"
                            type={showSecrets['mp_access_token'] ? 'text' : 'password'}
                            value={integrationSettings.mercado_pago.access_token}
                            onChange={(e) => handleIntegrationChange('mercado_pago', 'access_token', e.target.value)}
                            disabled={!isEditing}
                            placeholder="APP_USR-..."
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => toggleSecretVisibility('mp_access_token')}
                          >
                            {showSecrets['mp_access_token'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="mp_public_key">Public Key</Label>
                        <Input
                          id="mp_public_key"
                          value={integrationSettings.mercado_pago.public_key}
                          onChange={(e) => handleIntegrationChange('mercado_pago', 'public_key', e.target.value)}
                          disabled={!isEditing}
                          placeholder="APP_USR-..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="mp_client_id">Client ID</Label>
                        <Input
                          id="mp_client_id"
                          value={integrationSettings.mercado_pago.client_id}
                          onChange={(e) => handleIntegrationChange('mercado_pago', 'client_id', e.target.value)}
                          disabled={!isEditing}
                          placeholder="Seu Client ID"
                        />
                      </div>
                      <div>
                        <Label htmlFor="mp_client_secret">Client Secret</Label>
                        <div className="relative">
                          <Input
                            id="mp_client_secret"
                            type={showSecrets['mp_client_secret'] ? 'text' : 'password'}
                            value={integrationSettings.mercado_pago.client_secret}
                            onChange={(e) => handleIntegrationChange('mercado_pago', 'client_secret', e.target.value)}
                            disabled={!isEditing}
                            placeholder="Seu Client Secret"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => toggleSecretVisibility('mp_client_secret')}
                          >
                            {showSecrets['mp_client_secret'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        <strong>Como obter as credenciais:</strong><br />
                        1. Acesse o painel do desenvolvedor do Mercado Pago<br />
                        2. Crie uma aplicação ou use uma existente<br />
                        3. Copie as credenciais de produção ou teste conforme necessário
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Default Package Dimensions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Package className="h-5 w-5 mr-2" />
                    Dimensões Padrão dos Produtos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="default_weight_kg">Peso Padrão (kg)</Label>
                      <Input
                        id="default_weight_kg"
                        type="number"
                        step="0.1"
                        value={settings?.default_weight_kg || ''}
                        onChange={(e) => handleInputChange('default_weight_kg', parseFloat(e.target.value) || 0)}
                        disabled={!isEditing}
                        placeholder="0.3"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="default_length_cm">Comprimento (cm)</Label>
                        <Input
                          id="default_length_cm"
                          type="number"
                          value={settings?.default_length_cm || ''}
                          onChange={(e) => handleInputChange('default_length_cm', parseInt(e.target.value) || 0)}
                          disabled={!isEditing}
                          placeholder="20"
                        />
                      </div>
                      <div>
                        <Label htmlFor="default_height_cm">Altura (cm)</Label>
                        <Input
                          id="default_height_cm"
                          type="number"
                          value={settings?.default_height_cm || ''}
                          onChange={(e) => handleInputChange('default_height_cm', parseInt(e.target.value) || 0)}
                          disabled={!isEditing}
                          placeholder="2"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="default_width_cm">Largura (cm)</Label>
                        <Input
                          id="default_width_cm"
                          type="number"
                          value={settings?.default_width_cm || ''}
                          onChange={(e) => handleInputChange('default_width_cm', parseInt(e.target.value) || 0)}
                          disabled={!isEditing}
                          placeholder="16"
                        />
                      </div>
                      <div>
                        <Label htmlFor="default_diameter_cm">Diâmetro (cm)</Label>
                        <Input
                          id="default_diameter_cm"
                          type="number"
                          value={settings?.default_diameter_cm || ''}
                          onChange={(e) => handleInputChange('default_diameter_cm', parseInt(e.target.value) || 0)}
                          disabled={!isEditing}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Informações Importantes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div>
                      <p><strong>URL Base:</strong> Deve ser configurada para o domínio de produção quando o app estiver em produção</p>
                      <p><strong>Dimensões Padrão:</strong> Usadas quando o produto não tem dimensões específicas cadastradas</p>
                    </div>
                    
                    <Separator />
                    
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Melhor Envio</h4>
                      <p><strong>Client ID/Secret:</strong> Obtidos no painel do desenvolvedor do Melhor Envio</p>
                      <p><strong>Access Token:</strong> Gerado via OAuth após autorização da aplicação</p>
                      <p><strong>Ambiente:</strong> Use Sandbox para testes e Produção para uso real</p>
                    </div>
                    
                    <Separator />
                    
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Mercado Pago</h4>
                      <p><strong>Access Token:</strong> Token para realizar transações (formato APP_USR-...)</p>
                      <p><strong>Public Key:</strong> Chave pública para o frontend</p>
                      <p><strong>Client ID/Secret:</strong> Para integrações avançadas e webhooks</p>
                    </div>
                    
                    <Separator />
                    
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-yellow-800"><strong>⚠️ Segurança:</strong> Todas as credenciais são armazenadas de forma segura nos segredos do Supabase</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
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

        <TabsContent value="integrations" className="space-y-6 mt-6">
          <TenantIntegrations />
        </TabsContent>

        {isMaster && (
          <TabsContent value="tenants" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <TenantsManager />
              </div>
              <div>
                <TenantSimulator />
              </div>
            </div>
          </TabsContent>
        )}
          </Tabs>
        </div>
        </div>
      </div>
    );
  }

  const statisticsCards = [
    {
      title: 'Integrações Ativas',
      value: '3',
      description: 'Mercado Pago, Melhor Envio, WhatsApp',
      icon: Settings,
      color: 'text-blue-600'
    },
    {
      title: 'Cupons Ativos',
      value: '0',
      description: 'Cupons de desconto disponíveis',
      icon: Percent,
      color: 'text-green-600'
    },
    {
      title: 'Brindes Configurados',
      value: '0',
      description: 'Brindes automáticos cadastrados',
      icon: Gift,
      color: 'text-purple-600'
    },
    {
      title: 'Status Geral',
      value: 'Configurado',
      description: 'Sistema operacional',
      icon: TrendingUp,
      color: 'text-orange-600'
    }
  ];

  const dashboardItems = [
    {
      title: 'Configurações Gerais',
      description: 'Parâmetros do sistema e integrações',
      icon: Settings,
      action: () => setActiveView('config'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      title: 'Cupons de Desconto',
      description: 'Criar e gerenciar cupons promocionais',
      icon: Percent,
      action: () => setActiveView('config'),
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      title: 'Brindes e Promoções',
      description: 'Configurar brindes automáticos',
      icon: Gift,
      action: () => setActiveView('config'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    },
    {
      title: 'Integrações',
      description: 'Mercado Pago, Melhor Envio e WhatsApp',
      icon: Database,
      action: () => setActiveView('config'),
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center">
            <Settings className="h-10 w-10 mr-3 text-primary" />
            Centro de Controle - Configurações
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Configure e personalize o sistema completo
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
                onClick={item.action}
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
      </div>
    </div>
  );
};

export default Config;