import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, CheckCircle2, XCircle, TestTube, Eye, EyeOff, Settings, Tag } from 'lucide-react';
import ShippingServiceSelector from './ShippingServiceSelector';
import CorreiosCWSLabels from './CorreiosCWSLabels';

interface CorreiosIntegrationProps {
  tenantId: string;
}

interface CorreiosIntegrationData {
  id?: string;
  from_cep: string;
  client_id: string;
  client_secret: string;
  contrato: string;
  cartao_postagem: string;
  is_active: boolean;
  enabled_services: Record<string, boolean>;
}

const CORREIOS_SERVICES = [
  { key: 'PAC', name: 'PAC', description: 'Econômico' },
  { key: 'SEDEX', name: 'SEDEX', description: 'Expresso' },
  { key: 'Mini Envios', name: 'Mini Envios', description: 'Pequenos objetos até 300g' },
];

export default function CorreiosIntegration({ tenantId }: CorreiosIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CorreiosIntegrationData>({
    from_cep: '',
    client_id: '',
    client_secret: '',
    contrato: '',
    cartao_postagem: '',
    is_active: false,
    enabled_services: {},
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; services?: string[] } | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

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
        let enabledServices: Record<string, boolean> = {};
        try {
          const parsed = JSON.parse((data as any).enabled_services || '{}');
          if (typeof parsed === 'object' && !Array.isArray(parsed)) enabledServices = parsed;
        } catch { /* default empty */ }

        setFormData({
          id: data.id,
          from_cep: data.from_cep || '',
          client_id: data.client_id || '',
          client_secret: data.client_secret || '',
          contrato: data.scope || '',
          cartao_postagem: data.refresh_token || '',
          is_active: data.is_active,
          enabled_services: enabledServices,
        });
      }
      
      return data;
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CorreiosIntegrationData) => {
      const payload: Record<string, any> = {
        tenant_id: tenantId,
        provider: 'correios',
        access_token: 'contract',
        from_cep: data.from_cep.replace(/\D/g, ''),
        client_id: data.client_id,
        client_secret: data.client_secret,
        scope: data.contrato,
        refresh_token: data.cartao_postagem,
        is_active: data.is_active,
        sandbox: false,
        enabled_services: JSON.stringify(data.enabled_services),
      };

      if (data.id) {
        const { error } = await supabase
          .from('shipping_integrations')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        // Use upsert to handle case where record already exists (unique constraint on tenant_id + provider)
        const { error } = await supabase
          .from('shipping_integrations')
          .upsert(payload, { onConflict: 'tenant_id,provider' });
        if (error) throw error;
      }

      if (data.is_active) {
        await supabase
          .from('shipping_integrations')
          .update({ is_active: false })
          .eq('tenant_id', tenantId)
          .neq('provider', 'correios');
      }
    },
    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Configuração dos Correios salva com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['correios-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['shipping-checklist-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['correios-status', tenantId] });
    },
    onError: (error: any) => {
      toast({ title: 'Erro', description: error.message || 'Erro ao salvar configuração', variant: 'destructive' });
    },
  });

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('correios-shipping', {
        body: {
          tenant_id: tenantId,
          to_postal_code: '01310100',
          products: [{ weight: 0.5, insurance_value: 100, quantity: 1 }],
        },
      });
      if (error) throw error;
      if (data?.success && data?.shipping_options?.length > 0) {
        const foundServices = data.shipping_options.map((opt: any) => opt.name);
        setTestResult({ success: true, message: `Conexão OK! ${data.shipping_options.length} serviço(s) disponível(is).`, services: foundServices });
      } else {
        setTestResult({ success: false, message: data?.error || 'Nenhum serviço retornado', services: [] });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Erro ao testar conexão', services: [] });
    } finally {
      setIsTesting(false);
    }
  };

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  const isFormValid = formData.from_cep && formData.client_id && formData.client_secret && formData.cartao_postagem;

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
              <Package className="h-6 w-6 text-amber-600" />
              <div>
                <CardTitle>Correios - Contrato Próprio</CardTitle>
                <CardDescription>
                  Integração direta com a API dos Correios usando seu contrato comercial
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {formData.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config" className="gap-2"><Settings className="h-4 w-4" />Configuração</TabsTrigger>
          {formData.is_active && (
            <TabsTrigger value="etiquetas" className="gap-2"><Tag className="h-4 w-4" />Etiquetas</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Credenciais do Contrato</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowSecrets(!showSecrets)}>
                    {showSecrets ? <><EyeOff className="h-4 w-4 mr-2" />Ocultar</> : <><Eye className="h-4 w-4 mr-2" />Mostrar</>}
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="client_id">Client ID</Label>
                    <Input id="client_id" type={showSecrets ? 'text' : 'password'} value={formData.client_id} onChange={(e) => setFormData({ ...formData, client_id: e.target.value })} placeholder="Seu Client ID dos Correios" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client_secret">Client Secret</Label>
                    <Input id="client_secret" type={showSecrets ? 'text' : 'password'} value={formData.client_secret} onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })} placeholder="Seu Client Secret" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contrato">Número do Contrato</Label>
                    <Input id="contrato" type={showSecrets ? 'text' : 'password'} value={formData.contrato} onChange={(e) => setFormData({ ...formData, contrato: e.target.value })} placeholder="Número do contrato (opcional)" />
                    <p className="text-xs text-muted-foreground">Opcional - usado para algumas consultas</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cartao_postagem">Cartão de Postagem</Label>
                    <Input id="cartao_postagem" type={showSecrets ? 'text' : 'password'} value={formData.cartao_postagem} onChange={(e) => setFormData({ ...formData, cartao_postagem: e.target.value })} placeholder="Número do cartão de postagem" />
                    <p className="text-xs text-muted-foreground">Obrigatório para autenticação</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="from_cep">CEP de Origem</Label>
                <Input id="from_cep" value={formData.from_cep} onChange={(e) => setFormData({ ...formData, from_cep: formatCEP(e.target.value) })} placeholder="00000-000" maxLength={9} />
                <p className="text-xs text-muted-foreground">CEP do seu centro de distribuição para cálculo do frete</p>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending || !isFormValid}>
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Configuração
                </Button>
                <Button variant="outline" onClick={handleTest} disabled={isTesting || !isFormValid}>
                  {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                  Testar Conexão
                </Button>
              </div>

              {testResult && (
                <Alert variant={testResult.success ? 'default' : 'destructive'}>
                  {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertDescription>{testResult.message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <ShippingServiceSelector
            services={CORREIOS_SERVICES}
            enabledServices={formData.enabled_services}
            onToggle={(key, enabled) => {
              const updated = { ...formData.enabled_services, [key]: enabled };
              setFormData({ ...formData, enabled_services: updated });
            }}
          />
        </TabsContent>

        {formData.is_active && (
          <TabsContent value="etiquetas">
            <CorreiosCWSLabels
              tenantId={tenantId}
              integrationId={formData.id || ''}
              fromCep={formData.from_cep}
              senderJsonRaw={integration?.webhook_secret as string}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
