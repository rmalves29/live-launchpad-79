import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Settings } from 'lucide-react';

export const TenantIntegrations = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
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
  }, [profile?.id]);

  const loadIntegrations = async () => {
    if (!profile?.id) return;

    try {
      // Load WhatsApp integration
      const { data: whatsapp } = await supabase
        .from('integration_whatsapp')
        .select('*')
        .eq('tenant_id', profile.id)
        .maybeSingle();

      if (whatsapp) {
        setWhatsappConfig({
          api_url: whatsapp.api_url || '',
          instance_name: whatsapp.instance_name || '',
          webhook_secret: whatsapp.webhook_secret || '',
          is_active: whatsapp.is_active
        });
      }

      // Load Payment integration
      const { data: payment } = await supabase
        .from('payment_integrations')
        .select('*')
        .eq('tenant_id', profile.id)
        .maybeSingle();

      if (payment) {
        setPaymentConfig({
          provider: payment.provider,
          access_token: payment.access_token || '',
          public_key: payment.public_key || '',
          client_id: payment.client_id || '',
          client_secret: payment.client_secret || '',
          webhook_secret: payment.webhook_secret || '',
          is_active: payment.is_active
        });
      }

      // Load Shipping integration
      const { data: shipping } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('tenant_id', profile.id)
        .maybeSingle();

      if (shipping) {
        setShippingConfig({
          provider: shipping.provider,
          access_token: shipping.access_token || '',
          client_id: shipping.client_id || '',
          client_secret: shipping.client_secret || '',
          webhook_secret: shipping.webhook_secret || '',
          from_cep: shipping.from_cep || '31575060',
          sandbox: shipping.sandbox,
          is_active: shipping.is_active
        });
      }

      // Load Bling integration
      const { data: bling } = await supabase
        .from('bling_integrations')
        .select('*')
        .eq('tenant_id', profile.id)
        .maybeSingle();

      if (bling) {
        setBlingConfig({
          client_id: bling.client_id || '',
          client_secret: bling.client_secret || '',
          access_token: bling.access_token || '',
          refresh_token: bling.refresh_token || '',
          environment: bling.environment || 'sandbox',
          is_active: bling.is_active
        });
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
      const { error } = await supabase
        .from('integration_whatsapp')
        .upsert({
          tenant_id: profile.id,
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
      const { error } = await supabase
        .from('payment_integrations')
        .upsert({
          tenant_id: profile.id,
          provider: paymentConfig.provider,
          access_token: paymentConfig.access_token,
          public_key: paymentConfig.public_key,
          client_id: paymentConfig.client_id,
          client_secret: paymentConfig.client_secret,
          webhook_secret: paymentConfig.webhook_secret,
          is_active: paymentConfig.is_active
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
      const { error } = await supabase
        .from('shipping_integrations')
        .upsert({
          tenant_id: profile.id,
          provider: shippingConfig.provider,
          access_token: shippingConfig.access_token,
          client_id: shippingConfig.client_id,
          client_secret: shippingConfig.client_secret,
          webhook_secret: shippingConfig.webhook_secret,
          from_cep: shippingConfig.from_cep,
          sandbox: shippingConfig.sandbox,
          is_active: shippingConfig.is_active
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
      const { error } = await supabase
        .from('bling_integrations')
        .upsert({
          tenant_id: profile.id,
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