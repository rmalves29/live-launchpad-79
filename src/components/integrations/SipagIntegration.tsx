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
import { Loader2, CheckCircle2, AlertCircle, Landmark, Info } from 'lucide-react';

interface SipagIntegrationProps {
  tenantId: string;
}

interface SipagData {
  id: string;
  tenant_id: string;
  client_id: string | null;
  client_secret: string | null;
  merchant_id: string | null;
  terminal_id: string | null;
  pix_key: string | null;
  webhook_secret: string | null;
  environment: string;
  is_active: boolean;
  enable_pix: boolean;
  enable_credit_card: boolean;
  enable_boleto: boolean;
}

export default function SipagIntegration({ tenantId }: SipagIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    client_id: '',
    client_secret: '',
    merchant_id: '',
    terminal_id: '',
    pix_key: '',
    webhook_secret: '',
    environment: 'production' as 'sandbox' | 'production',
    enable_pix: true,
    enable_credit_card: false,
    enable_boleto: false,
  });

  const { data: integration, isLoading } = useQuery({
    queryKey: ['sipag-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_sipag' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as SipagData | null;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (integration) {
      setFormData({
        client_id: integration.client_id || '',
        client_secret: integration.client_secret || '',
        merchant_id: integration.merchant_id || '',
        terminal_id: integration.terminal_id || '',
        pix_key: integration.pix_key || '',
        webhook_secret: integration.webhook_secret || '',
        environment: (integration.environment as 'sandbox' | 'production') || 'production',
        enable_pix: integration.enable_pix ?? true,
        enable_credit_card: integration.enable_credit_card ?? false,
        enable_boleto: integration.enable_boleto ?? false,
      });
    }
  }, [integration]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: tenantId,
        ...formData,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      if (integration) {
        const { error } = await supabase
          .from('integration_sipag' as any)
          .update(payload)
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('integration_sipag' as any).insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sipag-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['sipag-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mp-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['pagarme-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['appmax-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['infinitepay-status', tenantId] });
      setIsEditing(false);
      toast({
        title: 'Integração salva!',
        description: 'Sipag ativado. Outras integrações de pagamento foram desativadas automaticamente.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (active: boolean) => {
      if (!integration) return;
      const { error } = await supabase
        .from('integration_sipag' as any)
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sipag-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['sipag-status', tenantId] });
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
              <Landmark className="h-5 w-5" />
              Sipag (Sicoob)
            </CardTitle>
            <CardDescription>
              Configure as credenciais do Sipag para receber pagamentos via PIX, cartão e boleto
            </CardDescription>
          </div>
          {integration && !isEditing && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {integration.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <Switch
                checked={integration.is_active}
                onCheckedChange={(c) => toggleActiveMutation.mutate(c)}
                disabled={toggleActiveMutation.isPending}
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Pré-requisitos:</strong> conta PJ Sicoob com credenciamento e-commerce ativo,
            credenciais OAuth2 (Client ID e Secret) obtidas em{' '}
            <a href="https://developers.sicoob.com.br" target="_blank" rel="noopener noreferrer" className="underline">
              developers.sicoob.com.br
            </a>{' '}
            e chave PIX recebedora cadastrada. Ao ativar, outros gateways (MP, Pagar.me, Appmax, InfinitePay) serão desativados.
          </AlertDescription>
        </Alert>

        {integration && !isEditing ? (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Integração configurada e {integration.is_active ? 'ativa' : 'inativa'}.{' '}
                {integration.environment === 'sandbox' && '(Sandbox)'}
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 text-sm">
              <div><span className="font-medium">Ambiente:</span> {integration.environment === 'sandbox' ? 'Sandbox' : 'Produção'}</div>
              <div><span className="font-medium">Client ID:</span> {integration.client_id ? '••••••' : 'Não configurado'}</div>
              <div><span className="font-medium">Merchant ID:</span> {integration.merchant_id || '—'}</div>
              <div><span className="font-medium">Chave PIX:</span> {integration.pix_key || '—'}</div>
              <div className="flex gap-3 pt-1">
                <span>PIX: {integration.enable_pix ? '✅' : '❌'}</span>
                <span>Cartão: {integration.enable_credit_card ? '✅' : '❌'}</span>
                <span>Boleto: {integration.enable_boleto ? '✅' : '❌'}</span>
              </div>
            </div>

            <Alert className="border-destructive/50 bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-foreground">
                <strong>⚠️ Configure o webhook no painel Sicoob/Sipag:</strong>
                <div className="mt-2 p-2 bg-background rounded border font-mono text-xs break-all select-all">
                  https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/sipag-webhook?tenant_id={tenantId}
                </div>
                <p className="mt-2 text-xs">
                  Se o seu painel exigir um header de assinatura, use o valor do campo "Webhook Secret" como{' '}
                  <code>x-webhook-secret</code>.
                </p>
              </AlertDescription>
            </Alert>

            <Button onClick={() => setIsEditing(true)}>Editar Configurações</Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sipag_client_id">Client ID *</Label>
                <Input
                  id="sipag_client_id"
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sipag_client_secret">Client Secret *</Label>
                <Input
                  id="sipag_client_secret"
                  type="password"
                  value={formData.client_secret}
                  onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sipag_merchant_id">Merchant ID</Label>
                <Input
                  id="sipag_merchant_id"
                  value={formData.merchant_id}
                  onChange={(e) => setFormData({ ...formData, merchant_id: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sipag_terminal_id">Terminal ID</Label>
                <Input
                  id="sipag_terminal_id"
                  value={formData.terminal_id}
                  onChange={(e) => setFormData({ ...formData, terminal_id: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sipag_pix_key">Chave PIX recebedora *</Label>
              <Input
                id="sipag_pix_key"
                value={formData.pix_key}
                onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                placeholder="E-mail, CPF/CNPJ, telefone ou chave aleatória"
                required={formData.enable_pix}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sipag_webhook_secret">Webhook Secret (opcional)</Label>
              <Input
                id="sipag_webhook_secret"
                type="password"
                value={formData.webhook_secret}
                onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })}
                placeholder="Use se quiser proteger o webhook"
              />
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h4 className="font-medium">Métodos habilitados</h4>
              <div className="flex items-center justify-between">
                <Label htmlFor="sipag_pix">PIX</Label>
                <Switch
                  id="sipag_pix"
                  checked={formData.enable_pix}
                  onCheckedChange={(c) => setFormData({ ...formData, enable_pix: c })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sipag_cc">Cartão de Crédito (em breve)</Label>
                <Switch
                  id="sipag_cc"
                  checked={formData.enable_credit_card}
                  onCheckedChange={(c) => setFormData({ ...formData, enable_credit_card: c })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sipag_boleto">Boleto (em breve)</Label>
                <Switch
                  id="sipag_boleto"
                  checked={formData.enable_boleto}
                  onCheckedChange={(c) => setFormData({ ...formData, enable_boleto: c })}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="sipag_env"
                checked={formData.environment === 'sandbox'}
                onCheckedChange={(c) =>
                  setFormData({ ...formData, environment: c ? 'sandbox' : 'production' })
                }
              />
              <Label htmlFor="sipag_env">Modo Sandbox (Homologação)</Label>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Ao salvar, o Sipag será ativado e os outros gateways de pagamento serão desativados automaticamente.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending || !formData.client_id || !formData.client_secret}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar e Ativar
              </Button>
              {integration && (
                <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
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
