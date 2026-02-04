import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, AlertCircle, CreditCard, Info, ExternalLink } from 'lucide-react';

interface AppmaxIntegrationProps {
  tenantId: string;
}

interface IntegrationData {
  id: string;
  tenant_id: string;
  access_token: string | null;
  environment: string;
  is_active: boolean;
  appmax_customer_id: number | null;
  created_at: string;
  updated_at: string;
}

export default function AppmaxIntegration({ tenantId }: AppmaxIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    access_token: '',
    environment: 'production' as 'sandbox' | 'production',
  });
  const [isEditing, setIsEditing] = useState(false);

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['appmax-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_appmax')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar integração App Max:', error);
        throw error;
      }
      return data as IntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Verificar se existe outra integração de pagamento ativa
  const { data: otherPaymentActive } = useQuery({
    queryKey: ['other-payment-active-appmax', tenantId],
    queryFn: async () => {
      const [mpResult, pagarmeResult] = await Promise.all([
        supabase
          .from('integration_mp')
          .select('is_active')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('integration_pagarme')
          .select('is_active')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .maybeSingle(),
      ]);
      return mpResult.data?.is_active || pagarmeResult.data?.is_active || false;
    },
    enabled: !!tenantId,
  });

  // Preencher formulário ao carregar integração
  useEffect(() => {
    if (integration) {
      setFormData({
        access_token: integration.access_token || '',
        environment: integration.environment as 'sandbox' | 'production',
      });
    }
  }, [integration]);

  // Desativar outros provedores de pagamento
  const deactivateOtherProviders = async () => {
    await Promise.all([
      supabase
        .from('integration_mp')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId),
      supabase
        .from('integration_pagarme')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId),
    ]);
  };

  // Salvar integração
  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('[AppmaxIntegration] Salvando para tenant:', tenantId);
      
      // Desativar outros provedores antes de ativar App Max
      await deactivateOtherProviders();
      
      const dataToSave = {
        tenant_id: tenantId,
        access_token: formData.access_token || null,
        environment: formData.environment,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (integration) {
        const { error } = await supabase
          .from('integration_appmax')
          .update(dataToSave)
          .eq('id', integration.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_appmax')
          .insert([dataToSave]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appmax-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['payment-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['other-payment-active', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mp-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['pagarme-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['appmax-status', tenantId] });
      
      setIsEditing(false);
      toast({
        title: 'Integração salva!',
        description: 'As configurações do App Max foram salvas. Outros provedores de pagamento foram desativados.',
      });
    },
    onError: (error: Error) => {
      console.error('Erro ao salvar:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Desativar integração
  const deactivateMutation = useMutation({
    mutationFn: async () => {
      if (!integration) return;

      const { error } = await supabase
        .from('integration_appmax')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appmax-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['appmax-status', tenantId] });
      toast({
        title: 'Integração desativada',
        description: 'A integração App Max foi desativada.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao desativar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Ativar integração
  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!integration) return;

      // Desativar outros provedores
      await deactivateOtherProviders();

      const { error } = await supabase
        .from('integration_appmax')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appmax-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['appmax-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mp-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['pagarme-status', tenantId] });
      toast({
        title: 'Integração ativada',
        description: 'A integração App Max foi ativada. Outros provedores foram desativados.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao ativar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Integração de Pagamento - App Max
            </CardTitle>
            <CardDescription>
              Configure as credenciais do App Max para processar pagamentos via cartão, PIX e boleto
            </CardDescription>
          </div>
          {integration && !isEditing && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {integration.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <Switch
                checked={integration.is_active}
                onCheckedChange={(checked) => {
                  if (checked) {
                    activateMutation.mutate();
                  } else {
                    deactivateMutation.mutate();
                  }
                }}
                disabled={activateMutation.isPending || deactivateMutation.isPending}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerta de exclusividade */}
        {otherPaymentActive && !integration?.is_active && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Atenção:</strong> Ao ativar o App Max, o Mercado Pago e Pagar.me serão desativados automaticamente.
              Apenas uma integração de pagamento pode estar ativa por vez.
            </AlertDescription>
          </Alert>
        )}

        {integration && !isEditing ? (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Integração configurada e {integration.is_active ? 'ativa' : 'inativa'}.
                {integration.environment === 'sandbox' && ' (Modo Sandbox - Testes)'}
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Ambiente:</span>{' '}
                {integration.environment === 'sandbox' ? 'Sandbox (Testes)' : 'Produção'}
              </div>
              <div>
                <span className="font-medium">Access Token:</span>{' '}
                {integration.access_token ? '••••••••' : 'Não configurado'}
              </div>
            </div>

            {/* Link para documentação */}
            <Alert className="border-blue-500/50 bg-blue-500/10">
              <Info className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-foreground">
                <strong>Documentação App Max:</strong>
                <p className="mt-1 text-sm">
                  O App Max processa pagamentos via cartão de crédito, PIX e boleto. 
                  O token de acesso pode ser obtido no painel do App Max.
                </p>
                <a 
                  href="https://appmax.com.br" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-blue-500 hover:underline"
                >
                  Acessar Painel App Max <ExternalLink className="h-3 w-3" />
                </a>
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button onClick={() => setIsEditing(true)}>Editar Configurações</Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="access_token">Access Token *</Label>
              <Input
                id="access_token"
                type="password"
                value={formData.access_token}
                onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                placeholder="xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx"
                required
              />
              <p className="text-xs text-muted-foreground">
                Token de acesso obtido no painel do App Max
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="environment"
                checked={formData.environment === 'sandbox'}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, environment: checked ? 'sandbox' : 'production' })
                }
              />
              <Label htmlFor="environment">Modo Sandbox (Testes)</Label>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No modo Sandbox, os pagamentos são simulados e não há cobrança real.
                <br />
                <strong>Importante:</strong> Ao salvar, o App Max será ativado e outras integrações de pagamento serão desativadas.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saveMutation.isPending || !formData.access_token}
              >
                {saveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar e Ativar
              </Button>

              {integration && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
