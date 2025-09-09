import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Settings, CreditCard, Package, MessageCircle, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Integration {
  mercado_pago?: {
    id: string;
    public_key: string;
    access_token: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    public_base_url: string;
    webhook_secret: string;
  };
  melhor_envio?: {
    id: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    access_token: string;
    refresh_token: string;
    account_id: string;
    webhook_secret: string;
  };
  whatsapp?: {
    id: string;
    instance_name: string;
    business_phone: string;
    session_status: string;
    webhook_secret: string;
  };
}

export default function IntegrationsManager() {
  const { currentTenant, isAdmin } = useTenant();
  const [integrations, setIntegrations] = useState<Integration>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentTenant?.id) {
      loadIntegrations();
    }
  }, [currentTenant?.id]);

  const loadIntegrations = async () => {
    if (!currentTenant?.id) return;
    
    setLoading(true);
    try {
      const [mpResult, meResult, wppResult] = await Promise.all([
        supabase.from('integration_mp').select('*').eq('tenant_id', currentTenant.id).maybeSingle(),
        supabase.from('integration_me').select('*').eq('tenant_id', currentTenant.id).maybeSingle(),
        supabase.from('integration_wpp').select('*').eq('tenant_id', currentTenant.id).maybeSingle(),
      ]);

      const newIntegrations: Integration = {};
      if (mpResult.data) newIntegrations.mercado_pago = mpResult.data;
      if (meResult.data) newIntegrations.melhor_envio = meResult.data;
      if (wppResult.data) newIntegrations.whatsapp = wppResult.data;

      setIntegrations(newIntegrations);
    } catch (error) {
      console.error('Error loading integrations:', error);
      toast.error('Erro ao carregar integrações');
    } finally {
      setLoading(false);
    }
  };

  const saveMercadoPago = async (data: any) => {
    if (!currentTenant?.id) return;
    
    setSaving(true);
    try {
      const payload = {
        tenant_id: currentTenant.id,
        ...data
      };

      if (integrations.mercado_pago?.id) {
        await supabase
          .from('integration_mp')
          .update(payload)
          .eq('id', integrations.mercado_pago.id);
      } else {
        await supabase.from('integration_mp').insert([payload]);
      }

      toast.success('Configuração do Mercado Pago salva!');
      loadIntegrations();
    } catch (error) {
      console.error('Error saving Mercado Pago config:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const saveMelhorEnvio = async (data: any) => {
    if (!currentTenant?.id) return;
    
    setSaving(true);
    try {
      const payload = {
        tenant_id: currentTenant.id,
        ...data
      };

      if (integrations.melhor_envio?.id) {
        await supabase
          .from('integration_me')
          .update(payload)
          .eq('id', integrations.melhor_envio.id);
      } else {
        await supabase.from('integration_me').insert([payload]);
      }

      toast.success('Configuração do Melhor Envio salva!');
      loadIntegrations();
    } catch (error) {
      console.error('Error saving Melhor Envio config:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const saveWhatsApp = async (data: any) => {
    if (!currentTenant?.id) return;
    
    setSaving(true);
    try {
      const payload = {
        tenant_id: currentTenant.id,
        ...data
      };

      if (integrations.whatsapp?.id) {
        await supabase
          .from('integration_wpp')
          .update(payload)
          .eq('id', integrations.whatsapp.id);
      } else {
        await supabase.from('integration_wpp').insert([payload]);
      }

      toast.success('Configuração do WhatsApp salva!');
      loadIntegrations();
    } catch (error) {
      console.error('Error saving WhatsApp config:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Acesso Restrito</h3>
            <p className="text-muted-foreground">
              Apenas administradores podem gerenciar integrações.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-4">
          <div className="h-8 bg-muted animate-pulse rounded" />
          <div className="h-64 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Integrações</h1>
      </div>

      <Tabs defaultValue="mercado-pago" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="mercado-pago" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Mercado Pago
            {integrations.mercado_pago && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          </TabsTrigger>
          <TabsTrigger value="melhor-envio" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Melhor Envio
            {integrations.melhor_envio && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
            {integrations.whatsapp && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mercado-pago">
          <MercadoPagoConfig 
            data={integrations.mercado_pago}
            onSave={saveMercadoPago}
            saving={saving}
          />
        </TabsContent>

        <TabsContent value="melhor-envio">
          <MelhorEnvioConfig 
            data={integrations.melhor_envio}
            onSave={saveMelhorEnvio}
            saving={saving}
          />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppConfig 
            data={integrations.whatsapp}
            onSave={saveWhatsApp}
            saving={saving}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MercadoPagoConfig({ data, onSave, saving }: any) {
  const [formData, setFormData] = useState({
    public_key: data?.public_key || '',
    access_token: data?.access_token || '',
    client_id: data?.client_id || '',
    client_secret: data?.client_secret || '',
    redirect_uri: data?.redirect_uri || '',
    public_base_url: data?.public_base_url || window.location.origin,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração Mercado Pago</CardTitle>
        <CardDescription>
          Configure suas credenciais do Mercado Pago para processar pagamentos
        </CardDescription>
        {data?.webhook_secret && (
          <Badge variant="outline">
            Webhook Secret: {data.webhook_secret}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="public_key">Public Key</Label>
              <Input
                id="public_key"
                value={formData.public_key}
                onChange={(e) => setFormData({ ...formData, public_key: e.target.value })}
                placeholder="TEST-xxx ou APP_USR-xxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="access_token">Access Token</Label>
              <Input
                id="access_token"
                type="password"
                value={formData.access_token}
                onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                placeholder="TEST-xxx ou APP_USR-xxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_secret">Client Secret</Label>
              <Input
                id="client_secret"
                type="password"
                value={formData.client_secret}
                onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="redirect_uri">Redirect URI</Label>
              <Input
                id="redirect_uri"
                value={formData.redirect_uri}
                onChange={(e) => setFormData({ ...formData, redirect_uri: e.target.value })}
                placeholder="https://seuapp.com/callback"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="public_base_url">Public Base URL</Label>
              <Input
                id="public_base_url"
                value={formData.public_base_url}
                onChange={(e) => setFormData({ ...formData, public_base_url: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MelhorEnvioConfig({ data, onSave, saving }: any) {
  const [formData, setFormData] = useState({
    client_id: data?.client_id || '',
    client_secret: data?.client_secret || '',
    redirect_uri: data?.redirect_uri || '',
    account_id: data?.account_id || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração Melhor Envio</CardTitle>
        <CardDescription>
          Configure suas credenciais do Melhor Envio para cálculo de frete
        </CardDescription>
        {data?.webhook_secret && (
          <Badge variant="outline">
            Webhook Secret: {data.webhook_secret}
          </Badge>
        )}
        {data?.access_token && (
          <Badge variant="secondary">
            Token configurado ✓
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="me_client_id">Client ID</Label>
              <Input
                id="me_client_id"
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="me_client_secret">Client Secret</Label>
              <Input
                id="me_client_secret"
                type="password"
                value={formData.client_secret}
                onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="me_redirect_uri">Redirect URI</Label>
              <Input
                id="me_redirect_uri"
                value={formData.redirect_uri}
                onChange={(e) => setFormData({ ...formData, redirect_uri: e.target.value })}
                placeholder="https://seuapp.com/callback"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_id">Account ID (opcional)</Label>
              <Input
                id="account_id"
                value={formData.account_id}
                onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function WhatsAppConfig({ data, onSave, saving }: any) {
  const [formData, setFormData] = useState({
    instance_name: data?.instance_name || '',
    business_phone: data?.business_phone || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração WhatsApp</CardTitle>
        <CardDescription>
          Configure sua instância do WhatsApp para automações
        </CardDescription>
        {data?.webhook_secret && (
          <Badge variant="outline">
            Webhook Secret: {data.webhook_secret}
          </Badge>
        )}
        {data?.session_status && (
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(data.session_status)}`} />
            <span className="text-sm">Status: {data.session_status}</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="instance_name">Nome da Instância</Label>
              <Input
                id="instance_name"
                value={formData.instance_name}
                onChange={(e) => setFormData({ ...formData, instance_name: e.target.value })}
                placeholder="inst-meusite"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business_phone">Telefone do Negócio</Label>
              <Input
                id="business_phone"
                value={formData.business_phone}
                onChange={(e) => setFormData({ ...formData, business_phone: e.target.value })}
                placeholder="5511999999999"
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}