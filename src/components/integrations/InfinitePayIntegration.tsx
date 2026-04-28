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
import { Loader2, AlertCircle, Zap, DollarSign, Info } from 'lucide-react';

interface InfinitePayIntegrationProps {
  tenantId: string;
}

interface IntegrationData {
  id: string;
  tenant_id: string;
  handle: string | null;
  environment: string;
  pix_discount_percent: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function InfinitePayIntegration({ tenantId }: InfinitePayIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    handle: '',
    environment: 'production' as 'sandbox' | 'production',
    pix_discount_percent: 0,
  });
  const [isEditing, setIsEditing] = useState(false);

  const { data: integration, isLoading } = useQuery({
    queryKey: ['infinitepay-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_infinitepay' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as IntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Verificar se há outra integração de pagamento ativa (alerta de exclusividade)
  const { data: otherActive } = useQuery({
    queryKey: ['infinitepay-other-active', tenantId],
    queryFn: async () => {
      const [mp, pg, am] = await Promise.all([
        supabase.from('integration_mp').select('is_active').eq('tenant_id', tenantId).eq('is_active', true).maybeSingle(),
        supabase.from('integration_pagarme').select('is_active').eq('tenant_id', tenantId).eq('is_active', true).maybeSingle(),
        supabase.from('integration_appmax').select('is_active').eq('tenant_id', tenantId).eq('is_active', true).maybeSingle(),
      ]);
      return !!(mp.data?.is_active || pg.data?.is_active || am.data?.is_active);
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (integration) {
      setFormData({
        handle: integration.handle || '',
        environment: (integration.environment as 'sandbox' | 'production') || 'production',
        pix_discount_percent: integration.pix_discount_percent || 0,
      });
    }
  }, [integration]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['infinitepay-integration', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['infinitepay-status', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['infinitepay-checklist-status', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['mp-status', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['pagarme-status', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['appmax-status', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['infinitepay-other-active', tenantId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Sanitiza: remove @, $, espaços e qualquer sufixo após "/" (links fixos não servem aqui)
      const cleanHandle = formData.handle
        .trim()
        .replace(/^[@$]+/, '')
        .split('/')[0]
        .trim();
      if (!cleanHandle) throw new Error('Informe o handle (InfiniteTag)');

      const dataToSave = {
        tenant_id: tenantId,
        handle: cleanHandle,
        environment: formData.environment,
        is_active: true,
        pix_discount_percent: formData.pix_discount_percent || 0,
        updated_at: new Date().toISOString(),
      };

      if (integration) {
        const { error } = await supabase
          .from('integration_infinitepay' as any)
          .update(dataToSave)
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('integration_infinitepay' as any).insert([dataToSave]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setIsEditing(false);
      toast({
        title: 'Integração salva!',
        description: 'InfinitePay configurado. As outras integrações de pagamento foram desativadas automaticamente.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (active: boolean) => {
      if (!integration) return;
      const { error } = await supabase
        .from('integration_infinitepay' as any)
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Status atualizado', description: 'Integração InfinitePay atualizada.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
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
              <Zap className="h-5 w-5" />
              Integração de Pagamento - InfinitePay
            </CardTitle>
            <CardDescription>
              Configure seu handle (InfiniteTag) para gerar checkout do InfinitePay
            </CardDescription>
          </div>
          {integration && !isEditing && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {integration.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <Switch
                checked={integration.is_active}
                onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                disabled={toggleMutation.isPending}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {otherActive && !integration?.is_active && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Atenção:</strong> Ao ativar o InfinitePay, as demais integrações de pagamento (Mercado Pago, Pagar.me, App Max) serão desativadas automaticamente.
            </AlertDescription>
          </Alert>
        )}

        {integration && !isEditing ? (
          <div className="space-y-4">
            <Alert>
              <DollarSign className="h-4 w-4" />
              <AlertDescription>
                Integração configurada e {integration.is_active ? 'ativa' : 'inativa'}.
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Handle (InfiniteTag):</span>{' '}
                <code className="bg-muted px-2 py-0.5 rounded">@{integration.handle}</code>
              </div>
              <div>
                <span className="font-medium">URL do checkout:</span>{' '}
                <a
                  href={`https://checkout.infinitepay.io/${integration.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline break-all"
                >
                  checkout.infinitepay.io/{integration.handle}
                </a>
              </div>
              <div>
                <span className="font-medium">Desconto PIX:</span>{' '}
                {integration.pix_discount_percent
                  ? `${integration.pix_discount_percent}%`
                  : 'Sem desconto'}
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Webhook automático:</strong> não é necessário configurar nada no painel do InfinitePay. O sistema envia a URL do webhook automaticamente em cada link de pagamento gerado.
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
              <Label htmlFor="handle">Handle / InfiniteTag *</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">@</span>
                <Input
                  id="handle"
                  type="text"
                  value={formData.handle}
                  onChange={(e) => setFormData({ ...formData, handle: e.target.value.replace(/^@/, '') })}
                  placeholder="seu_handle"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Seu identificador público no InfinitePay (visto em <code>infinitepay.io/seu_handle</code>). Acesse o app InfinitePay → Perfil para encontrá-lo.
              </p>
            </div>

            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h4 className="font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Desconto PIX
              </h4>
              <div className="space-y-2">
                <Label htmlFor="ip_pix_discount">Desconto PIX (%)</Label>
                <Input
                  id="ip_pix_discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={formData.pix_discount_percent}
                  onChange={(e) =>
                    setFormData({ ...formData, pix_discount_percent: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="Ex: 5"
                />
                <p className="text-xs text-muted-foreground">
                  Aplicado automaticamente quando o cliente escolher PIX no checkout. 0 = sem desconto.
                  Como o InfinitePay não tem desconto PIX nativo, o desconto é aplicado antes de gerar o link.
                </p>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Ativando esta integração, as demais (MP, Pagar.me, App Max) serão automaticamente desativadas — apenas uma integração de pagamento pode ficar ativa por vez.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending || !formData.handle.trim()}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Configurações
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
