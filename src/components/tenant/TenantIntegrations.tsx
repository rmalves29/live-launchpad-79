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

  useEffect(() => {
    if (profile?.tenant_id) {
      loadIntegrations();
    }
  }, [profile?.tenant_id]);

  const loadIntegrations = async () => {
    if (!profile?.tenant_id) return;

    try {
      // Load WhatsApp integration
      const { data: whatsapp } = await supabase
        .from('integration_whatsapp')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
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
        .eq('tenant_id', profile.tenant_id)
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
        .eq('tenant_id', profile.tenant_id)
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
    if (!profile?.tenant_id) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('integration_whatsapp')
        .upsert({
          tenant_id: profile.tenant_id,
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
          <Button onClick={() => {/* TODO: Implement save payment */}} disabled={loading}>
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
          <Button onClick={() => {/* TODO: Implement save shipping */}} disabled={loading}>
            Salvar Melhor Envio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};