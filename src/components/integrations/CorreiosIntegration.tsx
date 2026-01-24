import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, CheckCircle2, XCircle, Truck, AlertTriangle, TestTube } from 'lucide-react';

interface CorreiosIntegrationProps {
  tenantId: string;
}

interface CorreiosIntegrationData {
  id?: string;
  from_cep: string;
  is_active: boolean;
}

export default function CorreiosIntegration({ tenantId }: CorreiosIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CorreiosIntegrationData>({
    from_cep: '',
    is_active: false,
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['correios-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('provider', 'correios')
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setFormData({
          id: data.id,
          from_cep: data.from_cep || '',
          is_active: data.is_active,
        });
      }
      
      return data;
    },
    enabled: !!tenantId,
  });

  // Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: async (data: CorreiosIntegrationData) => {
      const payload = {
        tenant_id: tenantId,
        provider: 'correios',
        access_token: 'contract', // Token é gerenciado via secrets
        from_cep: data.from_cep.replace(/\D/g, ''),
        is_active: data.is_active,
        sandbox: false,
      };

      if (data.id) {
        const { error } = await supabase
          .from('shipping_integrations')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shipping_integrations')
          .insert(payload);
        if (error) throw error;
      }

      // Se ativando Correios, desativar outras integrações de frete
      if (data.is_active) {
        await supabase
          .from('shipping_integrations')
          .update({ is_active: false })
          .eq('tenant_id', tenantId)
          .neq('provider', 'correios');
      }
    },
    onSuccess: () => {
      toast({
        title: 'Sucesso',
        description: 'Configuração dos Correios salva com sucesso!',
      });
      queryClient.invalidateQueries({ queryKey: ['correios-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['shipping-checklist-status', tenantId] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configuração',
        variant: 'destructive',
      });
    },
  });

  // Testar conexão
  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('correios-shipping', {
        body: {
          tenant_id: tenantId,
          to_postal_code: '01310100', // CEP de teste (Av. Paulista)
          products: [{ weight: 0.5, insurance_value: 100, quantity: 1 }],
        },
      });

      if (error) throw error;

      if (data?.success && data?.shipping_options?.length > 0) {
        setTestResult({
          success: true,
          message: `Conexão OK! ${data.shipping_options.length} serviços disponíveis.`,
        });
      } else {
        setTestResult({
          success: false,
          message: data?.error || 'Nenhum serviço retornado',
        });
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Erro ao testar conexão',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-yellow-600" />
              <div>
                <CardTitle>Correios - Contrato Próprio</CardTitle>
                <CardDescription>
                  Integração direta com a API dos Correios usando seu contrato comercial
                </CardDescription>
              </div>
            </div>
            <Badge variant={formData.is_active ? 'default' : 'secondary'}>
              {formData.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              As credenciais do contrato (Client ID, Client Secret, Contrato e Cartão de Postagem) 
              são configuradas via segredos do Supabase. Entre em contato com o administrador para configurar.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="from_cep">CEP de Origem</Label>
              <Input
                id="from_cep"
                value={formData.from_cep}
                onChange={(e) => setFormData({ ...formData, from_cep: formatCEP(e.target.value) })}
                placeholder="00000-000"
                maxLength={9}
              />
              <p className="text-xs text-muted-foreground">
                CEP do seu centro de distribuição para cálculo do frete
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Ativar Integração</Label>
                <p className="text-xs text-muted-foreground">
                  Ao ativar, outras integrações de frete serão desativadas
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending || !formData.from_cep}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Configuração
            </Button>
            
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || !formData.from_cep}
            >
              {isTesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              Testar Conexão
            </Button>
          </div>

          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Serviços disponíveis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Serviços Disponíveis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium">PAC</p>
                <p className="text-xs text-muted-foreground">Econômico</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium">SEDEX</p>
                <p className="text-xs text-muted-foreground">Expresso</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium">Mini Envios</p>
                <p className="text-xs text-muted-foreground">Pequenos objetos</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
