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
import { Loader2, Package, CheckCircle2, XCircle, Truck, TestTube, Eye, EyeOff } from 'lucide-react';
import CorreiosBulkLabels from './CorreiosBulkLabels';

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
  token_meuscorreios: string;
  is_active: boolean;
}

export default function CorreiosIntegration({ tenantId }: CorreiosIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CorreiosIntegrationData>({
    from_cep: '',
    client_id: '',
    client_secret: '',
    contrato: '',
    cartao_postagem: '',
    token_meuscorreios: '',
    is_active: false,
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; services?: string[] } | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

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
          client_id: data.client_id || '',
          client_secret: data.client_secret || '',
          contrato: data.scope || '',
          cartao_postagem: data.refresh_token || '',
          token_meuscorreios: data.token_type || '',
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
        access_token: 'contract',
        from_cep: data.from_cep.replace(/\D/g, ''),
        client_id: data.client_id,
        client_secret: data.client_secret,
        scope: data.contrato,
        refresh_token: data.cartao_postagem,
        token_type: data.token_meuscorreios,
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
      queryClient.invalidateQueries({ queryKey: ['correios-status', tenantId] });
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
        // Extrair nomes dos serviços encontrados
        const foundServices = data.shipping_options.map((opt: any) => opt.name);
        setTestResult({
          success: true,
          message: `Conexão OK! ${data.shipping_options.length} serviço(s) disponível(is).`,
          services: foundServices,
        });
      } else {
        setTestResult({
          success: false,
          message: data?.error || 'Nenhum serviço retornado',
          services: [],
        });
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Erro ao testar conexão',
        services: [],
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
        <CardContent className="space-y-6">
          {/* Credenciais da API */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Credenciais do Contrato</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSecrets(!showSecrets)}
              >
                {showSecrets ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Ocultar
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Mostrar
                  </>
                )}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client_id">Client ID</Label>
                <Input
                  id="client_id"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  placeholder="Seu Client ID dos Correios"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_secret">Client Secret</Label>
                <Input
                  id="client_secret"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.client_secret}
                  onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                  placeholder="Seu Client Secret"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contrato">Número do Contrato</Label>
                <Input
                  id="contrato"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.contrato}
                  onChange={(e) => setFormData({ ...formData, contrato: e.target.value })}
                  placeholder="Número do contrato (opcional)"
                />
                <p className="text-xs text-muted-foreground">
                  Opcional - usado para algumas consultas
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cartao_postagem">Cartão de Postagem</Label>
                <Input
                  id="cartao_postagem"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.cartao_postagem}
                  onChange={(e) => setFormData({ ...formData, cartao_postagem: e.target.value })}
                  placeholder="Número do cartão de postagem"
                />
                <p className="text-xs text-muted-foreground">
                  Obrigatório para autenticação
                </p>
              </div>

              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="token_meuscorreios">Token MeusCorreios</Label>
                <Input
                  id="token_meuscorreios"
                  type={showSecrets ? 'text' : 'password'}
                  value={formData.token_meuscorreios}
                  onChange={(e) => setFormData({ ...formData, token_meuscorreios: e.target.value })}
                  placeholder="Token gerado em MeusCorreios > Configurações > Tokens"
                />
                <p className="text-xs text-muted-foreground">
                  Obrigatório para gerar etiquetas. Acesse meuscorreios.app → Configurações → Tokens.
                </p>
              </div>
            </div>
          </div>

          {/* CEP de Origem */}
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

          {/* Botões de Ação */}
          <div className="flex gap-2">
            <Button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending || !isFormValid}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Configuração
            </Button>
            
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || !isFormValid}
            >
              {isTesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              Testar Conexão
            </Button>
          </div>

          {/* Resultado do Teste */}
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
            {[
              { name: 'PAC', description: 'Econômico' },
              { name: 'SEDEX', description: 'Expresso' },
              { name: 'Mini Envios', description: 'Pequenos objetos' },
            ].map((service) => {
              const isAvailable = testResult?.services?.includes(service.name);
              const hasTestedSuccessfully = testResult?.success;
              
              return (
                <div 
                  key={service.name}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    hasTestedSuccessfully && !isAvailable ? 'opacity-50' : ''
                  }`}
                >
                  {hasTestedSuccessfully ? (
                    isAvailable ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    )
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <div>
                    <p className="font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">{service.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {!testResult && (
            <p className="text-sm text-muted-foreground mt-3">
              Clique em "Testar Conexão" para verificar quais serviços estão disponíveis no seu contrato.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Bulk Labels - only show when integration is active */}
      {formData.is_active && formData.token_meuscorreios && (
        <CorreiosBulkLabels tenantId={tenantId} />
      )}
    </div>
  );
}
