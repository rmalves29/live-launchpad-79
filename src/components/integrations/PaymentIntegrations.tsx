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
import { 
  TenantPaymentIntegration, 
  PaymentIntegrationFormData,
  getProviderLabel 
} from '@/types/integrations';
import { Loader2, CheckCircle2, AlertCircle, CreditCard, DollarSign } from 'lucide-react';

interface PaymentIntegrationsProps {
  tenantId: string;
}

export default function PaymentIntegrations({ tenantId }: PaymentIntegrationsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<PaymentIntegrationFormData>({
    provider: 'mercado_pago',
    access_token: '',
    public_key: '',
    is_sandbox: true,
    webhook_secret: '',
  });
  const [isEditing, setIsEditing] = useState(false);

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['payment-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_payment_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('provider', 'mercado_pago')
        .maybeSingle();

      if (error) throw error;
      return data as TenantPaymentIntegration | null;
    },
  });

  // Preencher formulário ao carregar integração
  useEffect(() => {
    if (integration) {
      setFormData({
        provider: integration.provider,
        access_token: integration.access_token || '',
        public_key: integration.public_key || '',
        is_sandbox: integration.is_sandbox,
        webhook_secret: integration.webhook_secret || '',
      });
    }
  }, [integration]);

  // Validar credenciais
  const validateMutation = useMutation({
    mutationFn: async () => {
      // Aqui você chamaria uma API backend que valida as credenciais
      const response = await fetch('/api/integrations/payment/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          provider: formData.provider,
          access_token: formData.access_token,
          public_key: formData.public_key,
          is_sandbox: formData.is_sandbox,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao validar credenciais');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Credenciais válidas!',
        description: data.message || 'As credenciais foram validadas com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro na validação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Salvar integração
  const saveMutation = useMutation({
    mutationFn: async () => {
      const dataToSave = {
        tenant_id: tenantId,
        provider: formData.provider,
        access_token: formData.access_token,
        public_key: formData.public_key,
        is_sandbox: formData.is_sandbox,
        webhook_secret: formData.webhook_secret,
        is_active: true,
        last_verified_at: new Date().toISOString(),
      };

      if (integration) {
        const { error } = await supabase
          .from('tenant_payment_integrations')
          .update(dataToSave)
          .eq('id', integration.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tenant_payment_integrations')
          .insert([dataToSave]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-integration', tenantId] });
      setIsEditing(false);
      toast({
        title: 'Integração salva!',
        description: 'As configurações foram salvas com sucesso.',
      });
    },
    onError: (error: Error) => {
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
        .from('tenant_payment_integrations')
        .update({ is_active: false })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-integration', tenantId] });
      toast({
        title: 'Integração desativada',
        description: 'A integração foi desativada com sucesso.',
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
              Integração de Pagamento - Mercado Pago
            </CardTitle>
            <CardDescription>
              Configure as credenciais do Mercado Pago para processar pagamentos
            </CardDescription>
          </div>
          {integration && !isEditing && (
            <div className="flex items-center gap-2">
              {integration.is_active ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Ativo
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <AlertCircle className="h-4 w-4" />
                  Inativo
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {integration && !isEditing ? (
          <div className="space-y-4">
            <Alert>
              <DollarSign className="h-4 w-4" />
              <AlertDescription>
                Integração configurada e {integration.is_active ? 'ativa' : 'inativa'}.
                {integration.is_sandbox && ' (Modo Sandbox - Testes)'}
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Provider:</span>{' '}
                {getProviderLabel(integration.provider)}
              </div>
              <div>
                <span className="font-medium">Ambiente:</span>{' '}
                {integration.is_sandbox ? 'Sandbox (Testes)' : 'Produção'}
              </div>
              <div>
                <span className="font-medium">Última verificação:</span>{' '}
                {integration.last_verified_at
                  ? new Date(integration.last_verified_at).toLocaleString('pt-BR')
                  : 'Nunca'}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setIsEditing(true)}>Editar Configurações</Button>
              {integration.is_active && (
                <Button
                  variant="outline"
                  onClick={() => deactivateMutation.mutate()}
                  disabled={deactivateMutation.isPending}
                >
                  Desativar
                </Button>
              )}
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
                onChange={(e) =>
                  setFormData({ ...formData, access_token: e.target.value })
                }
                placeholder="APP_USR-..."
                required
              />
              <p className="text-xs text-gray-500">
                Token de acesso obtido no painel do Mercado Pago
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="public_key">Public Key</Label>
              <Input
                id="public_key"
                type="text"
                value={formData.public_key || ''}
                onChange={(e) =>
                  setFormData({ ...formData, public_key: e.target.value })
                }
                placeholder="APP_USR-..."
              />
              <p className="text-xs text-gray-500">
                Chave pública para uso no frontend (opcional)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook_secret">Webhook Secret</Label>
              <Input
                id="webhook_secret"
                type="password"
                value={formData.webhook_secret || ''}
                onChange={(e) =>
                  setFormData({ ...formData, webhook_secret: e.target.value })
                }
                placeholder="Segredo para validar webhooks"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_sandbox"
                checked={formData.is_sandbox}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_sandbox: checked })
                }
              />
              <Label htmlFor="is_sandbox">Modo Sandbox (Testes)</Label>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No modo Sandbox, os pagamentos são simulados e não há cobrança real.
                Use para testes antes de ativar em produção.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => validateMutation.mutate()}
                disabled={
                  validateMutation.isPending || !formData.access_token
                }
              >
                {validateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Validar Credenciais
              </Button>

              <Button
                type="submit"
                disabled={saveMutation.isPending || !formData.access_token}
              >
                {saveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar Configurações
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
