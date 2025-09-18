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
import { Settings, Truck } from 'lucide-react';

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

  const [shippingConfig, setShippingConfig] = useState({
    provider: 'melhor_envio',
    client_id: '',
    client_secret: '',
    access_token: '',
    from_cep: '31575060',
    sandbox: true,
    webhook_secret: '',
    is_active: false
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadIntegrations();
    }
  }, [profile?.id, tenant?.id]);

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const callback = urlParams.get('callback');
    const code = urlParams.get('code');
    
    if (callback === 'melhor_envio' && code) {
      handleAuthCallback(code);
    }
  }, []);

  const generateAuthUrl = () => {
    if (!shippingConfig.client_id) {
      toast({
        title: 'Erro',
        description: 'Client ID é obrigatório para gerar link de autorização',
        variant: 'destructive'
      });
      return;
    }

    const redirectUri = `${window.location.origin}/config?tab=integracoes&callback=melhor_envio`;
    const baseUrl = shippingConfig.sandbox 
      ? 'https://sandbox.melhorenvio.com.br/oauth/authorize'
      : 'https://melhorenvio.com.br/oauth/authorize';
    
    const scopes = [
      'cart-read', 'cart-write', 
      'companies-read', 'companies-write',
      'coupons-read', 'coupons-write',
      'notifications-read', 
      'orders-read',
      'products-read', 'products-write',
      'purchases-read',
      'shipping-calculate', 'shipping-cancel', 'shipping-checkout', 'shipping-companies', 'shipping-generate', 'shipping-preview', 'shipping-print', 'shipping-share', 'shipping-tracking'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: shippingConfig.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes
    });

    const authUrl = `${baseUrl}?${params.toString()}`;
    window.open(authUrl, '_blank');
  };

  const handleAuthCallback = async (code: string) => {
    if (!shippingConfig.client_id || !shippingConfig.client_secret) {
      toast({
        title: 'Erro',
        description: 'Client ID e Client Secret são obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const redirectUri = `${window.location.origin}/config?tab=integracoes&callback=melhor_envio`;
      const tokenUrl = shippingConfig.sandbox 
        ? 'https://sandbox.melhorenvio.com.br/oauth/token'
        : 'https://melhorenvio.com.br/oauth/token';

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: shippingConfig.client_id,
          client_secret: shippingConfig.client_secret,
          redirect_uri: redirectUri,
          code: code
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.access_token) {
        setShippingConfig(prev => ({
          ...prev,
          access_token: data.access_token
        }));

        toast({
          title: 'Sucesso',
          description: 'Autorização concluída! Access token obtido com sucesso.'
        });

        // Remove callback parameter from URL
        const url = new URL(window.location.href);
        url.searchParams.delete('callback');
        url.searchParams.delete('code');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (error: any) {
      console.error('Error exchanging code for token:', error);
      toast({
        title: 'Erro',
        description: `Erro ao obter access token: ${error.message}`,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

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
        
        // Load WhatsApp data
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
        } else {
          console.log('No WhatsApp data found, using defaults');
          setWhatsappConfig({
            api_url: '',
            instance_name: '',
            webhook_secret: '',
            is_active: false
          });
        }

        // Load Payment data
        const { data: paymentData, error: paymentError } = await supabaseTenant.raw
          .from('integration_mp')
          .select('*') 
          .eq('tenant_id', currentTenantId)
          .maybeSingle();
          
        if (!paymentError && paymentData) {
          console.log('Payment data loaded:', paymentData);
          setPaymentConfig({
            provider: 'mercado_pago',
            access_token: paymentData.access_token || '',
            public_key: paymentData.public_key || '',
            client_id: paymentData.client_id || '',
            client_secret: paymentData.client_secret || '',
            webhook_secret: paymentData.webhook_secret || '',
            is_active: paymentData.is_active || false
          });
        } else {
          console.log('No Payment data found, using defaults');
          setPaymentConfig({
            provider: 'mercado_pago',
            access_token: '',
            public_key: '',
            client_id: '',
            client_secret: '',
            webhook_secret: '',
            is_active: false
          });
        }

        // Load Shipping data (Melhor Envio)
        const { data: shippingData, error: shippingError } = await supabaseTenant.raw
          .from('shipping_integrations')
          .select('*') 
          .eq('tenant_id', currentTenantId)
          .maybeSingle();
          
        if (!shippingError && shippingData) {
          console.log('Shipping data loaded:', shippingData);
          setShippingConfig({
            provider: 'melhor_envio',
            client_id: shippingData.client_id || '',
            client_secret: shippingData.client_secret || '',
            access_token: shippingData.access_token || '',
            from_cep: shippingData.from_cep || '31575060',
            sandbox: shippingData.sandbox !== false,
            webhook_secret: shippingData.webhook_secret || '',
            is_active: shippingData.is_active || false
          });
        } else {
          console.log('No Shipping data found, using defaults');
          setShippingConfig({
            provider: 'melhor_envio',
            client_id: '',
            client_secret: '',
            access_token: '',
            from_cep: '31575060',
            sandbox: true,
            webhook_secret: '',
            is_active: false
          });
        }
      }
    } catch (error) {
      console.error('Error loading integrations:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar integrações',
        variant: 'destructive'
      });
    }
  };

  const savePaymentIntegration = async () => {
    if (!profile?.id || !paymentConfig.access_token.trim()) {
      toast({
        title: 'Erro',
        description: 'Access Token é obrigatório',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      console.log('Saving payment integration via edge function');

      const { data, error } = await supabaseTenant.raw.functions.invoke('save-integration-settings', {
        body: {
          tenant_id: profile.role === 'super_admin' ? tenant?.id : profile.tenant_id,
          mercado_pago: {
            access_token: paymentConfig.access_token,
            public_key: paymentConfig.public_key,
            client_id: paymentConfig.client_id,
            client_secret: paymentConfig.client_secret,
            webhook_secret: paymentConfig.webhook_secret
          }
        }
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Configuração Mercado Pago salva com sucesso'
      });

      // Refresh integrations after save
      await loadIntegrations();
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

  const saveWhatsAppIntegration = async () => {
    if (!profile?.id || !whatsappConfig.api_url.trim() || !whatsappConfig.instance_name.trim()) {
      toast({
        title: 'Erro',
        description: 'API URL e Nome da Instância são obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const currentTenantId = profile.role === 'super_admin' ? tenant?.id : profile.tenant_id;
      
      if (!currentTenantId) {
        throw new Error('Tenant ID não encontrado');
      }

      // Insert or update WhatsApp integration
      const { error } = await supabaseTenant.raw
        .from('integration_whatsapp')
        .upsert({
          tenant_id: currentTenantId,
          api_url: whatsappConfig.api_url,
          instance_name: whatsappConfig.instance_name,
          webhook_secret: whatsappConfig.webhook_secret,
          is_active: whatsappConfig.is_active
        }, {
          onConflict: 'tenant_id'
        });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Configuração WhatsApp salva com sucesso'
      });

      // Refresh integrations after save
      await loadIntegrations();
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

  const saveShippingIntegration = async () => {
    // Validação dos campos obrigatórios
    if (!shippingConfig.client_id || !shippingConfig.client_secret || !shippingConfig.from_cep) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios: Client ID, Client Secret e CEP de Origem',
        variant: 'destructive'
      });
      return;
    }

    if (!profile?.id) {
      toast({
        title: 'Erro',
        description: 'Usuário não encontrado',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const currentTenantId = profile.role === 'super_admin' ? tenant?.id : profile.tenant_id;
      
      if (!currentTenantId) {
        throw new Error('Tenant ID não encontrado');
      }

      console.log('Salvando integração do Melhor Envio para tenant:', currentTenantId);

      const integrationData = {
        tenant_id: currentTenantId,
        provider: 'melhor_envio',
        client_id: shippingConfig.client_id,
        client_secret: shippingConfig.client_secret,
        access_token: shippingConfig.access_token || null,
        from_cep: shippingConfig.from_cep,
        sandbox: shippingConfig.sandbox,
        webhook_secret: shippingConfig.webhook_secret || null,
        is_active: shippingConfig.is_active,
        updated_at: new Date().toISOString()
      };

      console.log('Dados para salvar:', integrationData);

      // Usar upsert para lidar com insert e update automaticamente
      const { error } = await supabaseTenant.raw
        .from('shipping_integrations')
        .upsert(integrationData, {
          onConflict: 'tenant_id,provider'
        });

      if (error) {
        console.error('Erro na operação do banco:', error);
        throw error;
      }

      toast({
        title: 'Sucesso',
        description: 'Configuração Melhor Envio salva com sucesso!'
      });

      // Refresh integrations after save
      await loadIntegrations();
    } catch (error: any) {
      console.error('Error saving shipping integration:', error);
      toast({
        title: 'Erro',
        description: `Erro ao salvar configuração Melhor Envio: ${error.message}`,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!profile) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5" />
        <h2 className="text-2xl font-bold">Integrações</h2>
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
            <Label htmlFor="whatsapp-api-url">API URL</Label>
            <Input
              id="whatsapp-api-url"
              value={whatsappConfig.api_url}
              onChange={(e) =>
                setWhatsappConfig(prev => ({ ...prev, api_url: e.target.value }))
              }
              placeholder="https://api.whatsapp.example.com"
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
          <div>
            <Label htmlFor="whatsapp-webhook-secret">Webhook Secret</Label>
            <Input
              id="whatsapp-webhook-secret"
              type="password"
              value={whatsappConfig.webhook_secret}
              onChange={(e) =>
                setWhatsappConfig(prev => ({ ...prev, webhook_secret: e.target.value }))
              }
              placeholder="Seu webhook secret"
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
              placeholder="Seu Access Token do Mercado Pago"
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
              placeholder="Sua Public Key do Mercado Pago"
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
              placeholder="Seu Client ID do Mercado Pago"
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
              placeholder="Seu Client Secret do Mercado Pago"
            />
          </div>
          <div>
            <Label htmlFor="mp-webhook-secret">Webhook Secret</Label>
            <Input
              id="mp-webhook-secret"
              type="password"
              value={paymentConfig.webhook_secret}
              onChange={(e) =>
                setPaymentConfig(prev => ({ ...prev, webhook_secret: e.target.value }))
              }
              placeholder="Seu Webhook Secret do Mercado Pago"
            />
          </div>
          <Button onClick={savePaymentIntegration} disabled={loading}>
            Salvar Mercado Pago
          </Button>
        </CardContent>
      </Card>

      {/* Shipping Integration (Melhor Envio) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Frete (Melhor Envio)
            </div>
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
            <Label htmlFor="me-client-id">Client ID</Label>
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
              placeholder="Seu Access Token do Melhor Envio"
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
          <div className="flex items-center space-x-2">
            <Switch
              id="me-sandbox"
              checked={shippingConfig.sandbox}
              onCheckedChange={(checked) =>
                setShippingConfig(prev => ({ ...prev, sandbox: checked }))
              }
            />
            <Label htmlFor="me-sandbox">Modo Sandbox (Teste)</Label>
          </div>
          <div>
            <Label htmlFor="me-webhook-secret">Webhook Secret</Label>
            <Input
              id="me-webhook-secret"
              type="password"
              value={shippingConfig.webhook_secret}
              onChange={(e) =>
                setShippingConfig(prev => ({ ...prev, webhook_secret: e.target.value }))
              }
              placeholder="Seu Webhook Secret do Melhor Envio"
            />
          </div>

          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-md">
              <Label className="text-sm font-medium">URL do Webhook</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Use esta URL no painel do Melhor Envio:
              </p>
              <code className="block mt-2 p-2 bg-background rounded text-xs break-all">
                https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/webhook-melhor-envio
              </code>
            </div>

            <div className="p-4 border rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Autorização OAuth</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Para usar a API do Melhor Envio, você precisa autorizar seu aplicativo. 
                Certifique-se de ter preenchido o Client ID e Client Secret antes de prosseguir.
              </p>
              <Button
                type="button"
                onClick={generateAuthUrl}
                disabled={!shippingConfig.client_id || !shippingConfig.client_secret}
                variant="outline"
              >
                🔗 Gerar Link de Autorização
              </Button>
              {shippingConfig.access_token && (
                <p className="text-sm text-green-600 mt-2">
                  ✅ Access token obtido com sucesso!
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShippingConfig({
                provider: 'melhor_envio',
                client_id: '',
                client_secret: '',
                access_token: '',
                from_cep: '31575060',
                sandbox: true,
                webhook_secret: '',
                is_active: false
              })}
            >
              Limpar
            </Button>
            <Button
              onClick={saveShippingIntegration}
              disabled={isLoading}
            >
              {isLoading ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};