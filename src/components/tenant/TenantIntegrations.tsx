import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useAuth } from '@/hooks/useAuth';
import { useTenantContext } from '@/contexts/TenantContext';
import { Settings } from 'lucide-react';

export const TenantIntegrations = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { tenant } = useTenantContext();
  const [loading, setLoading] = useState(false);
  
  // WhatsApp Integration State
  const [whatsappConfig, setWhatsappConfig] = useState({
    api_url: '',
    instance_name: '',
    webhook_secret: '',
    is_active: false
  });

  // Payment Integration State
  const [paymentConfig, setPaymentConfig] = useState({
    provider: 'mercado_pago',
    access_token: '',
    public_key: '',
    client_id: '',
    client_secret: '',
    webhook_secret: '',
    is_active: false
  });

  // Shipping Integration State
  const [shippingConfig, setShippingConfig] = useState({
    provider: 'melhor_envio',
    access_token: '',
    client_id: '',
    client_secret: '',
    webhook_secret: '',
    from_cep: '31575060',
    sandbox: true,
    is_active: false
  });

  // Bling Integration State
  const [blingConfig, setBlingConfig] = useState({
    client_id: '',
    client_secret: '',
    access_token: '',
    refresh_token: '',
    environment: 'sandbox',
    is_active: false
  });

  useEffect(() => {
    if (profile?.id) {
      loadIntegrations();
    }
  }, [profile?.id, tenant?.id]);

  const loadIntegrations = async () => {
    if (!profile?.id) return;

    try {
      console.log('Loading integrations via edge function and database');

      // Get current tenant ID
      const currentTenantId = profile.role === 'super_admin' 
        ? (tenant?.id || null)  // Use selected tenant for super_admin
        : profile.tenant_id;     // Use user's tenant_id for regular users

      // Use the same edge function as Config page
      const { data, error } = await supabaseTenant.raw.functions.invoke('get-integration-settings');
      
      if (!error && data) {
        console.log('Integration data loaded:', data);
        
        // Set WhatsApp config (may not be in edge function, so keep default)
        setWhatsappConfig({
          api_url: '',
          instance_name: '',
          webhook_secret: '',
          is_active: false
        });

        // Set Payment config from edge function
        if (data.mercado_pago) {
          setPaymentConfig({
            provider: 'mercado_pago',
            access_token: data.mercado_pago.access_token || '',
            public_key: data.mercado_pago.public_key || '',
            client_id: data.mercado_pago.client_id || '',
            client_secret: data.mercado_pago.client_secret || '',
            webhook_secret: '',
            is_active: !!(data.mercado_pago.access_token)
          });
        }

        // Set Shipping config from edge function
        if (data.melhor_envio) {
          setShippingConfig({
            provider: 'melhor_envio',
            access_token: data.melhor_envio.access_token || '',
            client_id: data.melhor_envio.client_id || '',
            client_secret: data.melhor_envio.client_secret || '',
            webhook_secret: '',
            from_cep: data.melhor_envio.from_cep || '31575060',
            sandbox: data.melhor_envio.env === 'sandbox',
            is_active: !!(data.melhor_envio.client_id)
          });
        }
      }

      // Load Bling data from database
      if (currentTenantId) {
        console.log('Loading Bling data for tenant:', currentTenantId);
        
        const { data: blingData, error: blingError } = await supabaseTenant.raw
          .from('bling_integrations')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .maybeSingle();
          
        if (!blingError && blingData) {
          console.log('Bling data loaded:', blingData);
          setBlingConfig({
            client_id: blingData.client_id || '',
            client_secret: blingData.client_secret || '',
            access_token: blingData.access_token || '',
            refresh_token: blingData.refresh_token || '',
            environment: blingData.environment || 'sandbox',
            is_active: blingData.is_active || false
          });
        } else {
          console.log('No Bling data found, using defaults');
          setBlingConfig({
            client_id: '',
            client_secret: '',
            access_token: '',
            refresh_token: '',
            environment: 'sandbox',
            is_active: false
          });
        }
      }

    } catch (error) {
      console.error('Error loading integrations:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar configurações de integração',
        variant: 'destructive'
      });
    }
  };

  const saveWhatsAppIntegration = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      // Get current tenant ID
      const currentTenantId = profile.role === 'super_admin' 
        ? (tenant?.id || null)  // Use selected tenant for super_admin
        : profile.tenant_id;     // Use user's tenant_id for regular users

      console.log('Saving WhatsApp integration for tenant:', currentTenantId);

      const { error } = await supabaseTenant.raw
        .from('integration_whatsapp')
        .upsert({
          tenant_id: currentTenantId,
          api_url: whatsappConfig.api_url,
          instance_name: whatsappConfig.instance_name,
          webhook_secret: whatsappConfig.webhook_secret,
          is_active: whatsappConfig.is_active
        });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Configuração WhatsApp salva com sucesso'
      });
    } catch (error) {
      console.error('Error saving WhatsApp integration:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configuração WhatsApp',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const savePaymentIntegration = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      console.log('Saving Payment integration via edge function');

      // Use edge function to save integration settings
      const { error } = await supabaseTenant.raw.functions.invoke('save-integration-settings', {
        body: {
          mercado_pago: {
            access_token: paymentConfig.access_token,
            client_id: paymentConfig.client_id,
            client_secret: paymentConfig.client_secret,
            public_key: paymentConfig.public_key
          }
        }
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Configuração Mercado Pago salva com sucesso'
      });
    } catch (error) {
      console.error('Error saving payment integration:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configuração Mercado Pago',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveShippingIntegration = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      console.log('Saving Shipping integration via edge function');

      // Use edge function to save integration settings
      const { error } = await supabaseTenant.raw.functions.invoke('save-integration-settings', {
        body: {
          melhor_envio: {
            client_id: shippingConfig.client_id,
            client_secret: shippingConfig.client_secret,
            access_token: shippingConfig.access_token,
            from_cep: shippingConfig.from_cep,
            env: shippingConfig.sandbox ? 'sandbox' : 'production'
          }
        }
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Configuração Melhor Envio salva com sucesso'
      });
    } catch (error) {
      console.error('Error saving shipping integration:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configuração Melhor Envio',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveBlingIntegration = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      // Get current tenant ID
      const currentTenantId = profile.role === 'super_admin' 
        ? (tenant?.id || null)  // Use selected tenant for super_admin
        : profile.tenant_id;     // Use user's tenant_id for regular users

      console.log('Saving Bling integration for tenant:', currentTenantId);

      const { error } = await supabaseTenant.raw
        .from('bling_integrations')
        .upsert({
          tenant_id: currentTenantId,
          client_id: blingConfig.client_id,
          client_secret: blingConfig.client_secret,
          access_token: blingConfig.access_token,
          refresh_token: blingConfig.refresh_token,
          environment: blingConfig.environment,
          is_active: blingConfig.is_active
        });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Configuração Bling salva com sucesso'
      });
    } catch (error) {
      console.error('Error saving bling integration:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configuração Bling',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Integrações</h2>
      </div>

      {/* WhatsApp Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            WhatsApp
            <Switch
              checked={whatsappConfig.is_active}
              onCheckedChange={(checked) => 
                setWhatsappConfig(prev => ({ ...prev, is_active: checked }))
              }
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="whatsapp-api-url">URL da API</Label>
            <Input
              id="whatsapp-api-url"
              value={whatsappConfig.api_url}
              onChange={(e) => 
                setWhatsappConfig(prev => ({ ...prev, api_url: e.target.value }))
              }
              placeholder="https://api.whatsapp.com"
            />
          </div>
          <div>
            <Label htmlFor="whatsapp-instance">Nome da Instância</Label>
            <Input
              id="whatsapp-instance"
              value={whatsappConfig.instance_name}
              onChange={(e) => 
                setWhatsappConfig(prev => ({ ...prev, instance_name: e.target.value }))
              }
              placeholder="minha-instancia"
            />
          </div>
          <Button onClick={saveWhatsAppIntegration} disabled={loading}>
            Salvar WhatsApp
          </Button>
        </CardContent>
      </Card>

      {/* Payment Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Pagamento (Mercado Pago)
            <Switch
              checked={paymentConfig.is_active}
              onCheckedChange={(checked) => 
                setPaymentConfig(prev => ({ ...prev, is_active: checked }))
              }
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="mp-access-token">Access Token</Label>
            <Input
              id="mp-access-token"
              type="password"
              value={paymentConfig.access_token}
              onChange={(e) => 
                setPaymentConfig(prev => ({ ...prev, access_token: e.target.value }))
              }
              placeholder="APP_USR-xxx"
            />
          </div>
          <div>
            <Label htmlFor="mp-public-key">Public Key</Label>
            <Input
              id="mp-public-key"
              value={paymentConfig.public_key}
              onChange={(e) => 
                setPaymentConfig(prev => ({ ...prev, public_key: e.target.value }))
              }
              placeholder="APP_USR-xxx"
            />
          </div>
          <Button onClick={savePaymentIntegration} disabled={loading}>
            Salvar Mercado Pago
          </Button>
        </CardContent>
      </Card>

      {/* Shipping Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Envio (Melhor Envio)
            <Switch
              checked={shippingConfig.is_active}
              onCheckedChange={(checked) => 
                setShippingConfig(prev => ({ ...prev, is_active: checked }))
              }
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="me-client-id">ID Cliente</Label>
            <Input
              id="me-client-id"
              value={shippingConfig.client_id}
              onChange={(e) => 
                setShippingConfig(prev => ({ ...prev, client_id: e.target.value }))
              }
              placeholder="Seu Client ID do Melhor Envio"
            />
          </div>
          <div>
            <Label htmlFor="me-client-secret">Client Secret</Label>
            <Input
              id="me-client-secret"
              type="password"
              value={shippingConfig.client_secret}
              onChange={(e) => 
                setShippingConfig(prev => ({ ...prev, client_secret: e.target.value }))
              }
              placeholder="Seu Client Secret do Melhor Envio"
            />
          </div>
          <div>
            <Label htmlFor="me-access-token">Access Token</Label>
            <Input
              id="me-access-token"
              type="password"
              value={shippingConfig.access_token}
              onChange={(e) => 
                setShippingConfig(prev => ({ ...prev, access_token: e.target.value }))
              }
              placeholder="Token de acesso do Melhor Envio"
            />
          </div>
          <div>
            <Label htmlFor="me-from-cep">CEP de Origem</Label>
            <Input
              id="me-from-cep"
              value={shippingConfig.from_cep}
              onChange={(e) => 
                setShippingConfig(prev => ({ ...prev, from_cep: e.target.value }))
              }
              placeholder="31575060"
            />
          </div>
          <div>
            <Label htmlFor="me-environment">Ambiente</Label>
            <Select
              value={shippingConfig.sandbox ? 'sandbox' : 'production'}
              onValueChange={(value) => 
                setShippingConfig(prev => ({ ...prev, sandbox: value === 'sandbox' }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveShippingIntegration} disabled={loading}>
            Salvar Melhor Envio
          </Button>
        </CardContent>
      </Card>

      {/* Bling Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            ERP (Bling)
            <Switch
              checked={blingConfig.is_active}
              onCheckedChange={(checked) => 
                setBlingConfig(prev => ({ ...prev, is_active: checked }))
              }
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="bling-client-id">Client ID</Label>
            <Input
              id="bling-client-id"
              value={blingConfig.client_id}
              onChange={(e) => 
                setBlingConfig(prev => ({ ...prev, client_id: e.target.value }))
              }
              placeholder="Seu Client ID do Bling"
            />
          </div>
          <div>
            <Label htmlFor="bling-client-secret">Client Secret</Label>
            <Input
              id="bling-client-secret"
              type="password"
              value={blingConfig.client_secret}
              onChange={(e) => 
                setBlingConfig(prev => ({ ...prev, client_secret: e.target.value }))
              }
              placeholder="Seu Client Secret do Bling"
            />
          </div>
          <div>
            <Label htmlFor="bling-access-token">Access Token</Label>
            <Input
              id="bling-access-token"
              type="password"
              value={blingConfig.access_token}
              onChange={(e) => 
                setBlingConfig(prev => ({ ...prev, access_token: e.target.value }))
              }
              placeholder="Token de acesso do Bling"
            />
          </div>
          <div>
            <Label htmlFor="bling-refresh-token">Refresh Token</Label>
            <Input
              id="bling-refresh-token"
              type="password"
              value={blingConfig.refresh_token}
              onChange={(e) => 
                setBlingConfig(prev => ({ ...prev, refresh_token: e.target.value }))
              }
              placeholder="Token de renovação do Bling"
            />
          </div>
          <div>
            <Label htmlFor="bling-environment">Ambiente</Label>
            <Select
              value={blingConfig.environment}
              onValueChange={(value) => 
                setBlingConfig(prev => ({ ...prev, environment: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveBlingIntegration} disabled={loading}>
            Salvar Bling
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};