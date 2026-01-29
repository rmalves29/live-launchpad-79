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
import { Loader2, CheckCircle2, AlertCircle, CreditCard, DollarSign, Info } from 'lucide-react';

interface PagarMeIntegrationProps {
  tenantId: string;
}

interface IntegrationData {
  id: string;
  tenant_id: string;
  api_key: string | null;
  public_key: string | null;
  encryption_key: string | null;
  webhook_secret: string | null;
  environment: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function PagarMeIntegration({ tenantId }: PagarMeIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    api_key: '',
    public_key: '',
    encryption_key: '',
    webhook_secret: '',
    environment: 'production' as 'sandbox' | 'production',
  });
  const [isEditing, setIsEditing] = useState(false);

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['pagarme-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_pagarme')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar integração Pagar.me:', error);
        throw error;
      }
      return data as IntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Verificar se existe outra integração de pagamento ativa
  const { data: otherPaymentActive } = useQuery({
    queryKey: ['other-payment-active', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_mp')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .maybeSingle();
      return data?.is_active || false;
    },
    enabled: !!tenantId,
  });

  // Preencher formulário ao carregar integração
  useEffect(() => {
    if (integration) {
      setFormData({
        api_key: integration.api_key || '',
        public_key: integration.public_key || '',
        encryption_key: integration.encryption_key || '',
        webhook_secret: integration.webhook_secret || '',
        environment: integration.environment as 'sandbox' | 'production',
      });
    }
  }, [integration]);

  // Salvar integração
  const saveMutation = useMutation({
    mutationFn: async () => {
      console.log('[PagarMeIntegration] Salvando para tenant:', tenantId);
      
      const dataToSave = {
        tenant_id: tenantId,
        api_key: formData.api_key || null,
        public_key: formData.public_key || null,
        encryption_key: formData.encryption_key || null,
        webhook_secret: formData.webhook_secret || null,
        environment: formData.environment,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (integration) {
        const { error } = await supabase
          .from('integration_pagarme')
          .update(dataToSave)
          .eq('id', integration.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_pagarme')
          .insert([dataToSave]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: ['pagarme-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['payment-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['other-payment-active', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mp-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['pagarme-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mp-checklist-status', tenantId] });
      
      setIsEditing(false);
      toast({
        title: 'Integração salva!',
        description: 'As configurações do Pagar.me foram salvas. O Mercado Pago foi desativado automaticamente.',
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
        .from('integration_pagarme')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagarme-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['pagarme-status', tenantId] });
      toast({
        title: 'Integração desativada',
        description: 'A integração Pagar.me foi desativada.',
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
        .from('integration_pagarme')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagarme-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['pagarme-status', tenantId] });
      toast({
        title: 'Integração ativada',
        description: 'A integração Pagar.me foi ativada.',
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
              Integração de Pagamento - Pagar.me
            </CardTitle>
            <CardDescription>
              Configure as credenciais do Pagar.me para processar pagamentos
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
              <strong>Atenção:</strong> Ao ativar o Pagar.me, o Mercado Pago será desativado automaticamente.
              Apenas uma integração de pagamento pode estar ativa por vez.
            </AlertDescription>
          </Alert>
        )}

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
                <span className="font-medium">API Key:</span>{' '}
                {integration.api_key ? '••••••••' : 'Não configurado'}
              </div>
              <div>
                <span className="font-medium">Public Key:</span>{' '}
                {integration.public_key ? '••••••••' : 'Não configurado'}
              </div>
            </div>

            {/* Seção de Webhook obrigatória */}
            <Alert className="border-destructive/50 bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-foreground">
                <strong>⚠️ Configuração obrigatória do Webhook:</strong>
                <p className="mt-2 mb-1">Para que os pagamentos sejam confirmados automaticamente, configure o webhook no painel da Pagar.me:</p>
                <ol className="list-decimal ml-4 space-y-1 text-xs">
                  <li>Acesse <a href="https://dash.pagar.me" target="_blank" rel="noopener noreferrer" className="underline font-medium">dash.pagar.me</a> → Configurações → Webhooks</li>
                  <li>Clique em "Adicionar Webhook"</li>
                  <li>Cole a URL abaixo:</li>
                </ol>
                <div className="mt-2 p-2 bg-background rounded border font-mono text-xs break-all select-all">
                  https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/pagarme-webhook?tenant_id={tenantId}
                </div>
                <p className="mt-2 text-xs">
                  <strong>Eventos obrigatórios:</strong> charge.paid, order.paid
                </p>
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
              <Label htmlFor="api_key">API Key (Secret Key) *</Label>
              <Input
                id="api_key"
                type="password"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="sk_..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Chave secreta obtida no painel do Pagar.me
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="public_key">Public Key (Chave Pública)</Label>
              <Input
                id="public_key"
                type="text"
                value={formData.public_key || ''}
                onChange={(e) => setFormData({ ...formData, public_key: e.target.value })}
                placeholder="pk_..."
              />
              <p className="text-xs text-muted-foreground">
                Chave pública encontrada em Configurações → Chaves no painel Pagar.me
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook_secret">Webhook Secret</Label>
              <Input
                id="webhook_secret"
                type="password"
                value={formData.webhook_secret || ''}
                onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })}
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
                <br />
                <strong>Importante:</strong> Ao salvar, o Pagar.me será ativado e outras integrações de pagamento serão desativadas.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saveMutation.isPending || !formData.api_key}
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
