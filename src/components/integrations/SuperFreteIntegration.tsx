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
import { Loader2, AlertCircle, Package, Truck } from 'lucide-react';
import ShippingServiceSelector from '@/components/integrations/ShippingServiceSelector';

const SUPERFRETE_SERVICES = [
  { key: 'PAC', name: 'PAC', description: 'Correios PAC – econômico' },
  { key: 'SEDEX', name: 'SEDEX', description: 'Correios SEDEX – rápido' },
  { key: 'Mini Envios', name: 'Mini Envios', description: 'Correios – até 300g, mais barato' },
  { key: 'Jadlog .Package', name: 'Jadlog .Package', description: 'Jadlog – econômico' },
];

interface Props { tenantId: string; }

interface IntegrationData {
  id: string;
  tenant_id: string | null;
  provider: string;
  access_token: string;
  from_cep: string | null;
  sandbox: boolean;
  is_active: boolean;
  enabled_services?: string | null;
}

export default function SuperFreteIntegration({ tenantId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({ access_token: '', from_cep: '', sandbox: false });
  const [isEditing, setIsEditing] = useState(false);
  const [enabledServices, setEnabledServices] = useState<Record<string, boolean>>({});
  const [savingServices, setSavingServices] = useState(false);

  const { data: integration, isLoading } = useQuery({
    queryKey: ['superfrete-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('provider', 'superfrete')
        .maybeSingle();
      if (error) throw error;
      return data as IntegrationData | null;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (integration) {
      setFormData({
        access_token: integration.access_token || '',
        from_cep: integration.from_cep || '',
        sandbox: integration.sandbox,
      });
      if (integration.enabled_services) {
        try {
          const parsed = typeof integration.enabled_services === 'string'
            ? JSON.parse(integration.enabled_services)
            : integration.enabled_services;
          if (typeof parsed === 'object' && !Array.isArray(parsed)) setEnabledServices(parsed);
        } catch {}
      }
    }
  }, [integration]);

  // Desativa outras integrações de frete (regra "apenas 1 ativo por vez")
  const deactivateOthers = async () => {
    await supabase
      .from('shipping_integrations')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .neq('provider', 'superfrete');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dataToSave = {
        tenant_id: tenantId,
        provider: 'superfrete',
        access_token: formData.access_token,
        from_cep: formData.from_cep || null,
        sandbox: formData.sandbox,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      if (integration) {
        const { error } = await supabase
          .from('shipping_integrations')
          .update(dataToSave)
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shipping_integrations')
          .insert([dataToSave]);
        if (error) throw error;
      }
      await deactivateOthers();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superfrete-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['shipping-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mandae-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['superfrete-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['melhor-envio-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mandae-status', tenantId] });
      setIsEditing(false);
      toast({
        title: 'Integração salva!',
        description: 'SuperFrete ativo. Outras integrações de frete foram desativadas.',
      });
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (active: boolean) => {
      if (!integration) return;
      const { error } = await supabase
        .from('shipping_integrations')
        .update({ is_active: active })
        .eq('id', integration.id);
      if (error) throw error;
      if (active) await deactivateOthers();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superfrete-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['shipping-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mandae-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['superfrete-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['melhor-envio-status', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mandae-status', tenantId] });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const saveEnabledServices = async () => {
    setSavingServices(true);
    try {
      const { error } = await supabase
        .from('shipping_integrations')
        .update({ enabled_services: JSON.stringify(enabledServices) })
        .eq('tenant_id', tenantId)
        .eq('provider', 'superfrete');
      if (error) throw error;
      toast({ title: 'Salvo', description: 'Serviços atualizados.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingServices(false);
    }
  };

  const searchCEP = async (cep: string) => {
    try {
      const cleanCep = cep.replace(/\D/g, '');
      if (cleanCep.length !== 8) {
        toast({ title: 'CEP inválido', variant: 'destructive' });
        return;
      }
      const r = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const d = await r.json();
      if (d.erro) { toast({ title: 'CEP não encontrado', variant: 'destructive' }); return; }
      toast({ title: 'CEP válido!', description: `${d.logradouro}, ${d.localidade} - ${d.uf}` });
    } catch {
      toast({ title: 'Erro ao buscar CEP', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <Card><CardContent className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Integração de Envio - SuperFrete
            </CardTitle>
            <CardDescription>
              Configure o SuperFrete para calcular fretes e gerar etiquetas (PAC, SEDEX, Mini Envios, Jadlog)
            </CardDescription>
          </div>
          {integration && !isEditing && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{integration.is_active ? 'Ativo' : 'Inativo'}</span>
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
        {integration && !isEditing ? (
          <div className="space-y-4">
            <Alert>
              <Package className="h-4 w-4" />
              <AlertDescription>
                Integração configurada e {integration.is_active ? 'ativa' : 'inativa'}.
                {integration.sandbox && ' (Modo Sandbox - Testes)'}
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 text-sm">
              <div><span className="font-medium">Ambiente:</span> {integration.sandbox ? 'Sandbox (Testes)' : 'Produção'}</div>
              <div><span className="font-medium">CEP de Origem:</span> {integration.from_cep || 'Não configurado'}</div>
              <div><span className="font-medium">Token:</span> {integration.access_token ? '••••••••' : 'Não configurado'}</div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setIsEditing(true)}>Editar Configurações</Button>
            </div>

            {integration.is_active && (
              <div className="mt-4 space-y-3">
                <ShippingServiceSelector
                  services={SUPERFRETE_SERVICES}
                  enabledServices={enabledServices}
                  onToggle={(key, enabled) => setEnabledServices((p) => ({ ...p, [key]: enabled }))}
                />
                <Button onClick={saveEnabledServices} disabled={savingServices} className="w-full">
                  {savingServices ? 'Salvando...' : 'Salvar Serviços'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sf_token">API Token *</Label>
              <Input
                id="sf_token"
                type="password"
                value={formData.access_token}
                onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                placeholder="Token SuperFrete (Bearer)"
                required
              />
              <p className="text-xs text-muted-foreground">
                Gere em:{' '}
                <a href={formData.sandbox ? 'https://sandbox.superfrete.com/#/integrations' : 'https://web.superfrete.com/#/integrations'}
                   target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Painel SuperFrete → Integrações → Desenvolvedores
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sf_cep">CEP de Origem *</Label>
              <div className="flex gap-2">
                <Input
                  id="sf_cep"
                  value={formData.from_cep}
                  onChange={(e) => setFormData({ ...formData, from_cep: e.target.value })}
                  placeholder="00000-000"
                  required
                />
                <Button type="button" variant="outline" onClick={() => searchCEP(formData.from_cep)}>
                  Validar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">CEP de onde os produtos serão despachados</p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="sf_sandbox"
                checked={formData.sandbox}
                onCheckedChange={(c) => setFormData({ ...formData, sandbox: c })}
              />
              <Label htmlFor="sf_sandbox">Modo Sandbox (Testes)</Label>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Importante:</strong> ao salvar, qualquer outra integração de frete ativa (Melhor Envio, Mandae, Correios) será desativada automaticamente. Apenas 1 integração de frete pode ficar ativa por vez.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saveMutation.isPending || !formData.access_token || !formData.from_cep}
              >
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
