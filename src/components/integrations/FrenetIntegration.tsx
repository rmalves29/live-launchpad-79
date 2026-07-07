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
import { Loader2, AlertCircle, Package, Truck, Search } from 'lucide-react';
import ShippingServiceSelector from '@/components/integrations/ShippingServiceSelector';

interface Props {
  tenantId: string;
}

interface IntegrationData {
  id: string;
  tenant_id: string | null;
  provider: string;
  access_token: string;
  from_cep: string | null;
  sandbox: boolean;
  is_active: boolean;
  enabled_services: any;
}

interface FrenetService {
  ServiceCode: string;
  ServiceDescription: string;
  Carrier?: string;
}

export default function FrenetIntegration({ tenantId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({ access_token: '', from_cep: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [services, setServices] = useState<FrenetService[]>([]);
  const [enabledServices, setEnabledServices] = useState<Record<string, boolean>>({});
  const [loadingServices, setLoadingServices] = useState(false);
  const [savingServices, setSavingServices] = useState(false);

  const { data: integration, isLoading } = useQuery({
    queryKey: ['frenet-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('provider', 'frenet')
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

  const searchCEP = async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) {
      toast({ title: 'CEP inválido', variant: 'destructive' });
      return;
    }
    const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const d = await r.json();
    if (d.erro) return toast({ title: 'CEP não encontrado', variant: 'destructive' });
    toast({ title: 'CEP válido', description: `${d.logradouro}, ${d.localidade} - ${d.uf}` });
  };

  const listServices = async () => {
    setLoadingServices(true);
    try {
      const { data, error } = await supabase.functions.invoke('frenet-labels', {
        body: { action: 'list_services', tenant_id: tenantId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro Frenet');
      setServices(data.services || []);
      toast({ title: 'Serviços carregados', description: `${data.services?.length || 0} serviços disponíveis` });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingServices(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dataToSave = {
        tenant_id: tenantId,
        provider: 'frenet',
        access_token: formData.access_token,
        from_cep: formData.from_cep || null,
        sandbox: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      if (integration) {
        const { error } = await supabase.from('shipping_integrations').update(dataToSave).eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shipping_integrations').insert([dataToSave]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frenet-integration', tenantId] });
      setIsEditing(false);
      toast({ title: 'Integração Frenet salva!' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      if (!integration) return;
      const { error } = await supabase.from('shipping_integrations').update({ is_active: active }).eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['frenet-integration', tenantId] }),
  });

  const saveEnabledServices = async () => {
    setSavingServices(true);
    try {
      const { error } = await supabase
        .from('shipping_integrations')
        .update({ enabled_services: JSON.stringify(enabledServices) })
        .eq('tenant_id', tenantId)
        .eq('provider', 'frenet');
      if (error) throw error;
      toast({ title: 'Serviços salvos' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSavingServices(false);
    }
  };

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
              <Truck className="h-5 w-5" />
              Integração de Envio - Frenet
            </CardTitle>
            <CardDescription>
              Configure o token da Frenet para calcular fretes, gerar etiquetas e rastrear envios.
            </CardDescription>
          </div>
          {integration && !isEditing && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {integration.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <Switch
                checked={integration.is_active}
                onCheckedChange={(c) => toggleActive.mutate(c)}
                disabled={toggleActive.isPending}
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
              </AlertDescription>
            </Alert>
            <div className="grid gap-2 text-sm">
              <div><span className="font-medium">CEP de Origem:</span> {integration.from_cep || 'Não configurado'}</div>
              <div><span className="font-medium">Token:</span> {integration.access_token ? '••••••••' : 'Não configurado'}</div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setIsEditing(true)}>Editar Configurações</Button>
              <Button variant="outline" onClick={listServices} disabled={loadingServices}>
                {loadingServices ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Carregar Serviços
              </Button>
            </div>

            {integration.is_active && services.length > 0 && (
              <div className="mt-4 space-y-3">
                <ShippingServiceSelector
                  services={services.map((s) => ({
                    key: s.ServiceCode,
                    name: `${s.Carrier || 'Frenet'} - ${s.ServiceDescription}`,
                    description: s.ServiceCode,
                  }))}
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="frenet_token">API Token *</Label>
              <Input
                id="frenet_token"
                type="password"
                value={formData.access_token}
                onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                placeholder="Token Frenet (header 'token')"
                required
              />
              <p className="text-xs text-muted-foreground">
                Obtenha em: <a href="https://painel.frenet.com.br/Manager/AccessKey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Painel Frenet → Chaves de Acesso</a>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="frenet_cep">CEP de Origem *</Label>
              <div className="flex gap-2">
                <Input
                  id="frenet_cep"
                  value={formData.from_cep}
                  onChange={(e) => setFormData({ ...formData, from_cep: e.target.value })}
                  placeholder="00000-000"
                  required
                />
                <Button type="button" variant="outline" onClick={() => searchCEP(formData.from_cep)}>Validar</Button>
              </div>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                A Frenet usa o token cadastrado no painel para autenticar todas as chamadas (cotação, etiquetas e rastreio).
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending || !formData.access_token || !formData.from_cep}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Configurações
              </Button>
              {integration && (
                <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>Cancelar</Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
