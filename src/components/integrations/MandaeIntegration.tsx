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
import { Loader2, CheckCircle2, AlertCircle, Package, Truck } from 'lucide-react';

interface MandaeIntegrationProps {
  tenantId: string;
}

interface IntegrationData {
  id: string;
  tenant_id: string | null;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  client_id: string | null;
  client_secret: string | null;
  from_cep: string | null;
  sandbox: boolean;
  is_active: boolean;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function MandaeIntegration({ tenantId }: MandaeIntegrationProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    access_token: '',
    from_cep: '',
    sandbox: true,
    client_id: '',
  });
  const [isEditing, setIsEditing] = useState(false);

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['mandae-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('provider', 'mandae')
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar integração Mandae:', error);
        throw error;
      }
      return data as IntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Preencher formulário ao carregar
  useEffect(() => {
    if (integration) {
      setFormData({
        access_token: integration.access_token || '',
        from_cep: integration.from_cep || '',
        sandbox: integration.sandbox,
        client_id: integration.client_id || '',
      });
    }
  }, [integration]);

  // Buscar CEP
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

      toast({
        title: 'CEP válido!',
        description: `${data.logradouro}, ${data.localidade} - ${data.uf}`,
      });
    } catch (error) {
      toast({ title: 'Erro ao buscar CEP', variant: 'destructive' });
    }
  };

  // Salvar integração
  const saveMutation = useMutation({
    mutationFn: async () => {
      const dataToSave = {
        tenant_id: tenantId,
        provider: 'mandae',
        access_token: formData.access_token,
        from_cep: formData.from_cep || null,
        sandbox: formData.sandbox,
        client_id: formData.client_id || null,
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandae-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['shipping-integration', tenantId] });
      setIsEditing(false);
      toast({
        title: 'Integração salva!',
        description: 'As configurações do Mandae foram salvas com sucesso.',
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
        .from('shipping_integrations')
        .update({ is_active: false })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandae-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['shipping-integration', tenantId] });
      toast({
        title: 'Integração desativada',
        description: 'A integração Mandae foi desativada.',
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

      const { error } = await supabase
        .from('shipping_integrations')
        .update({ is_active: true })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandae-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['shipping-integration', tenantId] });
      toast({
        title: 'Integração ativada',
        description: 'A integração Mandae foi ativada.',
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
              <Truck className="h-5 w-5" />
              Integração de Envio - Mandae
            </CardTitle>
            <CardDescription>
              Configure as credenciais do Mandae para calcular fretes e gerar etiquetas
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
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
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
              <Package className="h-4 w-4" />
              <AlertDescription>
                Integração configurada e {integration.is_active ? 'ativa' : 'inativa'}.
                {integration.sandbox && ' (Modo Sandbox - Testes)'}
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Ambiente:</span>{' '}
                {integration.sandbox ? 'Sandbox (Testes)' : 'Produção'}
              </div>
              <div>
                <span className="font-medium">CEP de Origem:</span>{' '}
                {integration.from_cep || 'Não configurado'}
              </div>
              <div>
                <span className="font-medium">Token:</span>{' '}
                {integration.access_token ? '••••••••' : 'Não configurado'}
              </div>
              {integration.client_id && (
                <div>
                  <span className="font-medium">Customer ID:</span>{' '}
                  {integration.client_id}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setIsEditing(true)}>Editar Configurações</Button>
              {integration.is_active ? (
                <Button
                  variant="outline"
                  onClick={() => deactivateMutation.mutate()}
                  disabled={deactivateMutation.isPending}
                >
                  Desativar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => activateMutation.mutate()}
                  disabled={activateMutation.isPending}
                >
                  Ativar
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
              <Label htmlFor="mandae_token">API Token *</Label>
              <Input
                id="mandae_token"
                type="password"
                value={formData.access_token}
                onChange={(e) =>
                  setFormData({ ...formData, access_token: e.target.value })
                }
                placeholder="Token de acesso do Mandae"
                required
              />
              <p className="text-xs text-muted-foreground">
                Obtenha em: <a href="https://app.mandae.com.br" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Painel Mandae</a>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mandae_cep">CEP de Origem *</Label>
              <div className="flex gap-2">
                <Input
                  id="mandae_cep"
                  value={formData.from_cep}
                  onChange={(e) =>
                    setFormData({ ...formData, from_cep: e.target.value })
                  }
                  placeholder="00000-000"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => searchCEP(formData.from_cep)}
                >
                  Validar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                CEP de onde os produtos serão despachados
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mandae_customer_id">Customer ID (opcional)</Label>
              <Input
                id="mandae_customer_id"
                value={formData.client_id}
                onChange={(e) =>
                  setFormData({ ...formData, client_id: e.target.value })
                }
                placeholder="ID do cliente no Mandae"
              />
              <p className="text-xs text-muted-foreground">
                Necessário para alguns recursos avançados
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="mandae_sandbox"
                checked={formData.sandbox}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, sandbox: checked })
                }
              />
              <Label htmlFor="mandae_sandbox">Modo Sandbox (Testes)</Label>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No modo Sandbox, os envios são simulados. Use para testes antes de ativar em produção.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saveMutation.isPending || !formData.access_token || !formData.from_cep}
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
