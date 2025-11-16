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
import { Truck, Save, Loader2, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';

interface MelhorEnvioData {
  access_token: string;
  from_cep: string;
  sandbox: boolean;
  is_active: boolean;
}

export const TenantMelhorEnvioSettings = () => {
  const { tenantId } = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [formData, setFormData] = useState<MelhorEnvioData>({
    access_token: '',
    from_cep: '',
    sandbox: false,
    is_active: false,
  });

  useEffect(() => {
    if (tenantId) {
      loadMelhorEnvioData();
    }
  }, [tenantId]);

  const loadMelhorEnvioData = async () => {
    try {
      const { data, error } = await supabaseTenant.raw
        .from('shipping_integrations')
        .select('id, access_token, from_cep, sandbox, is_active')
        .eq('tenant_id', tenantId)
        .eq('provider', 'melhor_envio')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setIntegrationId(data.id);
        setFormData({
          access_token: data.access_token || '',
          from_cep: data.from_cep || '',
          sandbox: data.sandbox || false,
          is_active: data.is_active || false,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar dados do Melhor Envio:', error);
      toast.error('Erro ao carregar configurações do Melhor Envio');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId) return;

    // Validação básica
    if (!formData.access_token) {
      toast.error('Access Token é obrigatório');
      return;
    }

    if (!formData.from_cep || formData.from_cep.length !== 8) {
      toast.error('CEP de origem deve ter 8 dígitos');
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        tenant_id: tenantId,
        provider: 'melhor_envio',
        access_token: formData.access_token,
        from_cep: formData.from_cep,
        sandbox: formData.sandbox,
        is_active: formData.is_active,
      };

      let result;
      if (integrationId) {
        // Atualizar integração existente
        result = await supabaseTenant.raw
          .from('shipping_integrations')
          .update(dataToSave)
          .eq('id', integrationId);
      } else {
        // Criar nova integração
        result = await supabaseTenant.raw
          .from('shipping_integrations')
          .insert(dataToSave)
          .select()
          .single();
        
        if (result.data) {
          setIntegrationId(result.data.id);
        }
      }

      if (result.error) throw result.error;

      toast.success('Configurações do Melhor Envio salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar dados do Melhor Envio:', error);
      toast.error('Erro ao salvar configurações do Melhor Envio');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof MelhorEnvioData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatCEP = (value: string) => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    // Limita a 8 dígitos
    return numbers.slice(0, 8);
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
          <Truck className="h-5 w-5" />
          Melhor Envio
        </CardTitle>
        <CardDescription>
          Configure suas credenciais do Melhor Envio para calcular fretes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Para obter seu token de acesso, acesse o painel do Melhor Envio
            </span>
            <Button variant="ghost" size="sm" asChild>
              <a 
                href="https://melhorenvio.com.br/painel/gerenciar/tokens" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Acessar <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </Button>
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
              placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Token de produção do Melhor Envio
            </p>
          </div>

          <div>
            <Label htmlFor="from_cep">CEP de Origem *</Label>
            <Input
              id="from_cep"
              value={formData.from_cep}
              onChange={(e) => handleInputChange('from_cep', formatCEP(e.target.value))}
              placeholder="00000000"
              maxLength={8}
            />
            <p className="text-xs text-muted-foreground mt-1">
              CEP de onde os produtos serão enviados (apenas números)
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sandbox">Modo Sandbox (Testes)</Label>
              <p className="text-sm text-muted-foreground">
                Ative para usar o ambiente de testes
              </p>
            </div>
            <Switch
              id="sandbox"
              checked={formData.sandbox}
              onCheckedChange={(checked) => handleInputChange('sandbox', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Integração Ativa</Label>
              <p className="text-sm text-muted-foreground">
                Ative para começar a usar o Melhor Envio
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
                Integração ativa! Você pode calcular fretes via Melhor Envio.
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
