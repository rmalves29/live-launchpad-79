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
    loja_id: '',
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
      console.log('Loading integrations from database');

      // Get current tenant ID
      const currentTenantId = profile.role === 'super_admin' 
        ? (tenant?.id || null)  // Use selected tenant for super_admin
        : profile.tenant_id;     // Use user's tenant_id for regular users

      // Load tenant-specific data from database
      if (currentTenantId) {
        console.log('Loading tenant-specific data for:', currentTenantId);
        
        // Load Bling data
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
            loja_id: blingData.loja_id || '',
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
            loja_id: '',
            is_active: false
          });
        }

        // Load WhatsApp integration data
        const { data: whatsappData, error: whatsappError } = await supabaseTenant.raw
          .from('integration_whatsapp')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .maybeSingle();
          
        if (!whatsappError && whatsappData) {
          console.log('WhatsApp data loaded:', whatsappData);
          setWhatsappConfig({
            api_url: whatsappData.api_url || '',
            instance_name: whatsappData.instance_name || '',
            webhook_secret: whatsappData.webhook_secret || '',
            is_active: whatsappData.is_active || false
          });
        }

        // Load Mercado Pago data
        const { data: mpData, error: mpError } = await supabaseTenant.raw
          .from('integration_mp')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .maybeSingle();
          
        if (!mpError && mpData) {
          console.log('Mercado Pago data loaded:', mpData);
          setPaymentConfig({
            provider: 'mercado_pago',
            access_token: mpData.access_token || '',
            public_key: mpData.public_key || '',
            client_id: mpData.client_id || '',
            client_secret: mpData.client_secret || '',
            webhook_secret: mpData.webhook_secret || '',
            is_active: mpData.is_active || false
          });
        }

        // Load Melhor Envio data
        const { data: meData, error: meError } = await supabaseTenant.raw
          .from('integration_me')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .maybeSingle();
          
        if (!meError && meData) {
          console.log('Melhor Envio data loaded:', meData);
          setShippingConfig({
            provider: 'melhor_envio',
            access_token: meData.access_token || '',
            client_id: meData.client_id || '',
            client_secret: meData.client_secret || '',
            webhook_secret: '',
            from_cep: meData.from_cep || '31575060',
            sandbox: meData.environment === 'sandbox',
            is_active: meData.is_active || false
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
    if (!profile?.id || !tenant?.id) return;

    setLoading(true);
    try {
      console.log('Saving Payment integration via edge function');

      // Use edge function to save integration settings
      const { error } = await supabaseTenant.raw.functions.invoke('save-integration-settings', {
        body: {
          tenant_id: tenant.id,
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
      
      // Refresh settings after save
      loadIntegrations();
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
    if (!profile?.id || !tenant?.id) return;

    setLoading(true);
    try {
      console.log('Saving Shipping integration via edge function');

      // Use edge function to save integration settings
      const { error } = await supabaseTenant.raw.functions.invoke('save-integration-settings', {
        body: {
          tenant_id: tenant.id,
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
      
      // Refresh settings after save
      loadIntegrations();
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
    if (!profile?.id || !tenant?.id) return;

    setLoading(true);
    try {
      console.log('Saving Bling integration via edge function');

      // Use edge function to save integration settings
      const { error } = await supabaseTenant.raw.functions.invoke('save-integration-settings', {
        body: {
          tenant_id: tenant.id,
          bling: {
            client_id: blingConfig.client_id,
            client_secret: blingConfig.client_secret,
            access_token: blingConfig.access_token,
            refresh_token: blingConfig.refresh_token,
            environment: blingConfig.environment,
            loja_id: blingConfig.loja_id
          }
        }
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Configuração Bling salva com sucesso'
      });
      
      // Refresh settings after save
      loadIntegrations();
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
            <Label htmlFor="mp-public-key">Public Key</Label>
            <Input
              id="mp-public-key"
              value={paymentConfig.public_key}
              onChange={(e) => 
                setPaymentConfig(prev => ({ ...prev, public_key: e.target.value }))
              }
              placeholder="APP_USR_1ff4d53c-b702-49b9-8ecc-ec86c10b4b39"
            />
          </div>
          <div>
            <Label htmlFor="mp-access-token">Access Token</Label>
            <Input
              id="mp-access-token"
              type="password"
              value={paymentConfig.access_token}
              onChange={(e) => 
                setPaymentConfig(prev => ({ ...prev, access_token: e.target.value }))
              }
              placeholder="APP_USR_8967294933250718-f12515-..."
            />
          </div>
          <div>
            <Label htmlFor="mp-client-id">Client ID</Label>
            <Input
              id="mp-client-id"
              value={paymentConfig.client_id}
              onChange={(e) => 
                setPaymentConfig(prev => ({ ...prev, client_id: e.target.value }))
              }
              placeholder="8967294933250718"
            />
          </div>
          <div>
            <Label htmlFor="mp-client-secret">Client Secret</Label>
            <Input
              id="mp-client-secret"
              type="password"
              value={paymentConfig.client_secret}
              onChange={(e) => 
                setPaymentConfig(prev => ({ ...prev, client_secret: e.target.value }))
              }
              placeholder="6Umfiabw1AhBWR8TylqKoggfxQln2kIK"
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
            <Label htmlFor="bling-loja-id">Código da Loja (obrigatório)</Label>
            <Input
              id="bling-loja-id"
              value={blingConfig.loja_id}
              onChange={(e) => 
                setBlingConfig(prev => ({ ...prev, loja_id: e.target.value }))
              }
              placeholder="Ex: 123456789"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Código da loja cadastrada no Bling. Necessário para que os pedidos apareçam corretamente.
            </p>
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
          <div className="flex flex-col gap-2">
            <Button 
              onClick={saveBlingIntegration} 
              disabled={loading || !blingConfig.loja_id}
            >
              Salvar Bling
            </Button>
            {!blingConfig.loja_id && (
              <p className="text-sm text-red-600">
                ⚠️ Código da Loja é obrigatório para que os pedidos sejam criados corretamente no Bling.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};