import { useState, useEffect } from 'react';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { CreditCard, Save, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface MercadoPagoData {
  access_token: string;
  public_key: string;
  is_active: boolean;
}

export const TenantMercadoPagoSettings = () => {
  const { tenantId } = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [formData, setFormData] = useState<MercadoPagoData>({
    access_token: '',
    public_key: '',
    is_active: false,
  });

  useEffect(() => {
    if (tenantId) {
      loadMercadoPagoData();
    }
  }, [tenantId]);

  const loadMercadoPagoData = async () => {
    try {
      const { data, error } = await supabaseTenant.raw
        .from('integration_mp')
        .select('id, access_token, public_key, is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setIntegrationId(data.id);
        setFormData({
          access_token: data.access_token || '',
          public_key: data.public_key || '',
          is_active: data.is_active || false,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar dados do Mercado Pago:', error);
      toast.error('Erro ao carregar configurações do Mercado Pago');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId) return;

    // Validação básica
    if (!formData.access_token || !formData.public_key) {
      toast.error('Access Token e Public Key são obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        tenant_id: tenantId,
        access_token: formData.access_token,
        public_key: formData.public_key,
        is_active: formData.is_active,
        environment: 'production',
      };

      let result;
      if (integrationId) {
        // Atualizar integração existente
        result = await supabaseTenant.raw
          .from('integration_mp')
          .update(dataToSave)
          .eq('id', integrationId);
      } else {
        // Criar nova integração
        result = await supabaseTenant.raw
          .from('integration_mp')
          .insert(dataToSave)
          .select()
          .single();
        
        if (result.data) {
          setIntegrationId(result.data.id);
        }
      }

      if (result.error) throw result.error;

      toast.success('Configurações do Mercado Pago salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar dados do Mercado Pago:', error);
      toast.error('Erro ao salvar configurações do Mercado Pago');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof MercadoPagoData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Mercado Pago
        </CardTitle>
        <CardDescription>
          Configure suas credenciais do Mercado Pago para receber pagamentos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Para obter suas credenciais, acesse o{' '}
            <a 
              href="https://www.mercadopago.com.br/developers/panel/app" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              painel de desenvolvedores do Mercado Pago
            </a>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div>
            <Label htmlFor="access_token">Access Token *</Label>
            <Input
              id="access_token"
              type="password"
              value={formData.access_token}
              onChange={(e) => handleInputChange('access_token', e.target.value)}
              placeholder="APP_USR-..."
            />
          </div>

          <div>
            <Label htmlFor="public_key">Public Key *</Label>
            <Input
              id="public_key"
              value={formData.public_key}
              onChange={(e) => handleInputChange('public_key', e.target.value)}
              placeholder="APP_USR-..."
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Integração Ativa</Label>
              <p className="text-sm text-muted-foreground">
                Ative para começar a usar o Mercado Pago
              </p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleInputChange('is_active', checked)}
            />
          </div>

          {formData.is_active && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Integração ativa! Você pode receber pagamentos via Mercado Pago.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
