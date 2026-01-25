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
import { Loader2, CheckCircle2, AlertCircle, CreditCard, DollarSign } from 'lucide-react';

interface PaymentIntegrationsProps {
  tenantId: string;
}

interface IntegrationData {
  id: string;
  tenant_id: string;
  access_token: string | null;
  public_key: string | null;
  client_id: string | null;
  client_secret: string | null;
  webhook_secret: string | null;
  environment: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function PaymentIntegrations({ tenantId }: PaymentIntegrationsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    access_token: '',
    public_key: '',
    client_id: '',
    client_secret: '',
    webhook_secret: '',
    environment: 'production' as 'sandbox' | 'production',
  });
  const [isEditing, setIsEditing] = useState(false);

  // Buscar integração existente na tabela integration_mp
  const { data: integration, isLoading, error } = useQuery({
    queryKey: ['payment-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_mp')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar integração MP:', error);
        throw error;
      }
      return data as IntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Preencher formulário ao carregar integração
  useEffect(() => {
    if (integration) {
      setFormData({
        access_token: integration.access_token || '',
        public_key: integration.public_key || '',
        client_id: integration.client_id || '',
        client_secret: integration.client_secret || '',
        webhook_secret: integration.webhook_secret || '',
        environment: integration.environment as 'sandbox' | 'production',
      });
    }
  }, [integration]);

  // Salvar integração
  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('[PaymentIntegrations] Salvando para tenant:', tenantId);
      console.log('[PaymentIntegrations] Dados do formulário:', {
        access_token: formData.access_token ? '***' : null,
        public_key: formData.public_key,
        client_id: formData.client_id,
        environment: formData.environment
      });
      
      const dataToSave = {
        tenant_id: tenantId,
        access_token: formData.access_token || null,
        public_key: formData.public_key || null,
        client_id: formData.client_id || null,
        client_secret: formData.client_secret || null,
        webhook_secret: formData.webhook_secret || null,
        environment: formData.environment,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (integration) {
        console.log('[PaymentIntegrations] Atualizando integração existente:', integration.id);
        const { data, error } = await supabase
          .from('integration_mp')
          .update(dataToSave)
          .eq('id', integration.id)
          .select();

        console.log('[PaymentIntegrations] Resultado update:', { data, error });
        if (error) throw error;
      } else {
        console.log('[PaymentIntegrations] Criando nova integração');
        const { data, error } = await supabase
          .from('integration_mp')
          .insert([dataToSave])
          .select();

        console.log('[PaymentIntegrations] Resultado insert:', { data, error });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-integration', tenantId] });
      setIsEditing(false);
      toast({
        title: 'Integração salva!',
        description: 'As configurações do Mercado Pago foram salvas com sucesso.',
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
        .from('integration_mp')
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

  // Ativar integração - DEVE estar antes de qualquer return condicional
  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!integration) return;

      const { error } = await supabase
        .from('integration_mp')
        .update({ is_active: true })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-integration', tenantId] });
      toast({
        title: 'Integração ativada',
        description: 'A integração foi ativada com sucesso.',
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
              Integração de Pagamento - Mercado Pago
            </CardTitle>
            <CardDescription>
              Configure as credenciais do Mercado Pago para processar pagamentos
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
        {integration && !isEditing ? (
          <div className="space-y-4">
            <Alert>
              <DollarSign className="h-4 w-4" />
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
              <div>
                <span className="font-medium">Public Key:</span>{' '}
                {integration.public_key ? '••••••••' : 'Não configurado'}
              </div>
            </div>

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
                onChange={(e) =>
                  setFormData({ ...formData, access_token: e.target.value })
                }
                placeholder="APP_USR-..."
                required
              />
              <p className="text-xs text-muted-foreground">
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_id">Client ID</Label>
                <Input
                  id="client_id"
                  type="text"
                  value={formData.client_id || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, client_id: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_secret">Client Secret</Label>
                <Input
                  id="client_secret"
                  type="password"
                  value={formData.client_secret || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, client_secret: e.target.value })
                  }
                />
              </div>
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
