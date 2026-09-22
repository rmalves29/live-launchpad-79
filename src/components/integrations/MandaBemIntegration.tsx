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

const MANDA_BEM_SERVICES = [
  { key: 'PAC', name: 'PAC', description: 'Correios – econômico' },
  { key: 'SEDEX', name: 'SEDEX', description: 'Correios – rápido' },
  { key: 'PACMINI', name: 'Mini Envios', description: 'Correios – até 300g' },
];

interface MandaBemIntegrationProps {
  tenantId: string;
}

interface IntegrationData {
  id: string;
  tenant_id: string | null;
  provider: string;
  access_token: string;
  client_id: string | null;
  from_cep: string | null;
  sandbox: boolean;
  is_active: boolean;
  enabled_services?: string | null;
}

export default function MandaBemIntegration({ tenantId }: MandaBemIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    client_id: '',
    access_token: '',
    from_cep: '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [enabledServices, setEnabledServices] = useState<Record<string, boolean>>({});
  const [savingServices, setSavingServices] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data: integration, isLoading } = useQuery({
    queryKey: ['mandabem-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('provider', 'mandabem')
        .maybeSingle();
      if (error) throw error;
      return data as unknown as IntegrationData | null;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!integration) return;
    setFormData({
      client_id: integration.client_id || '',
      access_token: integration.access_token || '',
      from_cep: integration.from_cep || '',
    });
    try {
      const raw = integration.enabled_services;
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) setEnabledServices(parsed);
      }
    } catch { /* json inválido */ }
  }, [integration]);

  const searchCEP = async (cep: string) => {
    try {
      const cleanCep = cep.replace(/\D/g, '');
      if (cleanCep.length !== 8) {
        toast({ title: 'CEP inválido', variant: 'destructive' });
        return;
      }
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (data.erro) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      toast({ title: 'CEP válido!', description: `${data.logradouro}, ${data.localidade} - ${data.uf}` });
    } catch {
      toast({ title: 'Erro ao buscar CEP', variant: 'destructive' });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dataToSave = {
        tenant_id: tenantId,
        provider: 'mandabem',
        client_id: formData.client_id,
        access_token: formData.access_token,
        from_cep: formData.from_cep.replace(/\D/g, '') || null,
        sandbox: false,
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
        const { error } = await supabase.from('shipping_integrations').insert([dataToSave]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandabem-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mandabem-status', tenantId] });
      setIsEditing(false);
      toast({ title: 'Integração salva!', description: 'As credenciais do Manda Bem foram salvas.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!integration) return;
      const { error } = await supabase
        .from('shipping_integrations')
        .update({ is_active: isActive })
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandabem-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['mandabem-status', tenantId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const saveEnabledServices = async () => {
    setSavingServices(true);
    try {
      const { error } = await supabase
        .from('shipping_integrations')
        .update({ enabled_services: JSON.stringify(enabledServices) } as any)
        .eq('tenant_id', tenantId)
        .eq('provider', 'mandabem');
      if (error) throw error;
      toast({ title: 'Salvo', description: 'Serviços atualizados com sucesso.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingServices(false);
    }
  };

  const testQuote = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('mandabem-shipping', {
        body: { tenant_id: tenantId, to_postal_code: '01310100', products: [] },
      });
      if (error) throw error;
      if (data?.success) {
        const names = (data.shipping_options || []).map((o: any) => `${o.name} R$ ${Number(o.price).toFixed(2)}`);
        toast({ title: 'Cotação de teste concluída', description: names.join(' • ') || 'Sem opções retornadas' });
      } else {
        toast({ title: 'Não foi possível cotar', description: data?.error || 'Verifique as credenciais', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro no teste', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(false);
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
              Integração de Envio - Manda Bem
            </CardTitle>
            <CardDescription>
              Configure o API ID e o API Token do Manda Bem para cotar fretes e gerar etiquetas
            </CardDescription>
          </div>
          {integration && !isEditing && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {integration.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <Switch
                checked={integration.is_active}
                onCheckedChange={(checked) => toggleActiveMutation.mutate(checked)}
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
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">API ID:</span> {integration.client_id || 'Não configurado'}
              </div>
              <div>
                <span className="font-medium">API Token:</span> {integration.access_token ? '••••••••' : 'Não configurado'}
              </div>
              <div>
                <span className="font-medium">CEP de Origem:</span> {integration.from_cep || 'Não configurado'}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setIsEditing(true)}>Editar Configurações</Button>
              <Button variant="outline" onClick={testQuote} disabled={testing}>
                {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Testar Cotação
              </Button>
            </div>

            {integration.is_active && (
              <div className="mt-4 space-y-3">
                <ShippingServiceSelector
                  services={MANDA_BEM_SERVICES}
                  enabledServices={enabledServices}
                  onToggle={(key, enabled) => setEnabledServices((prev) => ({ ...prev, [key]: enabled }))}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mb_client_id">API ID *</Label>
                <Input
                  id="mb_client_id"
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  placeholder="ID da plataforma"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb_token">API Token *</Label>
                <Input
                  id="mb_token"
                  type="password"
                  value={formData.access_token}
                  onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                  placeholder="Chave da plataforma"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mb_cep">CEP de Origem *</Label>
              <div className="flex gap-2">
                <Input
                  id="mb_cep"
                  value={formData.from_cep}
                  onChange={(e) => setFormData({ ...formData, from_cep: e.target.value })}
                  placeholder="00000-000"
                  required
                />
                <Button type="button" variant="outline" onClick={() => searchCEP(formData.from_cep)}>
                  Validar
                </Button>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Gere o API ID e o API Token no painel do Manda Bem em Integrações → Ativar Web Service.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saveMutation.isPending || !formData.client_id || !formData.access_token || !formData.from_cep}
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
