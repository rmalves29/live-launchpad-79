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
  TenantShippingIntegration, 
  ShippingIntegrationFormData,
  SenderConfig,
  getProviderLabel,
  formatCurrency
} from '@/types/integrations';
import { Loader2, CheckCircle2, AlertCircle, Package, Truck } from 'lucide-react';

interface ShippingIntegrationsProps {
  tenantId: string;
}

export default function ShippingIntegrations({ tenantId }: ShippingIntegrationsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ShippingIntegrationFormData>({
    provider: 'melhor_envio',
    api_token: '',
    is_sandbox: true,
    sender_config: {
      name: '',
      phone: '',
      email: '',
      document: '',
      address: {
        postal_code: '',
        street: '',
        number: '',
        complement: '',
        district: '',
        city: '',
        state: '',
      },
    },
  });
  const [isEditing, setIsEditing] = useState(false);

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['shipping-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_shipping_integrations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('provider', 'melhor_envio')
        .maybeSingle();

      if (error) throw error;
      return data as TenantShippingIntegration | null;
    },
  });

  // Preencher formulário ao carregar integração
  useEffect(() => {
    if (integration) {
      setFormData({
        provider: integration.provider,
        api_token: integration.api_token || '',
        is_sandbox: integration.is_sandbox,
        sender_config: integration.sender_config,
        config: integration.config,
      });
    }
  }, [integration]);

  // Validar token
  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/integrations/shipping/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          provider: formData.provider,
          api_token: formData.api_token,
          is_sandbox: formData.is_sandbox,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao validar token');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Token válido!',
        description: `Saldo disponível: ${formatCurrency(data.balance_cents || 0)}`,
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
        api_token: formData.api_token,
        is_sandbox: formData.is_sandbox,
        sender_config: formData.sender_config,
        config: formData.config || {},
        is_active: true,
        last_verified_at: new Date().toISOString(),
      };

      if (integration) {
        const { error } = await supabase
          .from('tenant_shipping_integrations')
          .update(dataToSave)
          .eq('id', integration.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tenant_shipping_integrations')
          .insert([dataToSave]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipping-integration', tenantId] });
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

  // Buscar CEP
  const searchCEP = async (cep: string) => {
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, '')}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast({
          title: 'CEP não encontrado',
          variant: 'destructive',
        });
        return;
      }

      setFormData({
        ...formData,
        sender_config: {
          ...formData.sender_config,
          address: {
            ...formData.sender_config.address,
            postal_code: cep,
            street: data.logradouro,
            district: data.bairro,
            city: data.localidade,
            state: data.uf,
          },
        },
      });

      toast({
        title: 'CEP encontrado!',
        description: 'Endereço preenchido automaticamente.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao buscar CEP',
        variant: 'destructive',
      });
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
              Integração de Envio - Melhor Envio
            </CardTitle>
            <CardDescription>
              Configure as credenciais do Melhor Envio para gerenciar envios
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
              <Package className="h-4 w-4" />
              <AlertDescription>
                Integração configurada e {integration.is_active ? 'ativa' : 'inativa'}.
                {integration.is_sandbox && ' (Modo Sandbox - Testes)'}
                <br />
                Saldo: {formatCurrency(integration.balance_cents)}
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
                <span className="font-medium">Remetente:</span>{' '}
                {integration.sender_config.name}
              </div>
              <div>
                <span className="font-medium">Endereço:</span>{' '}
                {integration.sender_config.address.street}, {integration.sender_config.address.number} - {integration.sender_config.address.city}/{integration.sender_config.address.state}
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
            className="space-y-6"
          >
            {/* API Token */}
            <div className="space-y-2">
              <Label htmlFor="api_token">API Token *</Label>
              <Input
                id="api_token"
                type="password"
                value={formData.api_token}
                onChange={(e) =>
                  setFormData({ ...formData, api_token: e.target.value })
                }
                placeholder="Token de acesso do Melhor Envio"
                required
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

            {/* Dados do Remetente */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-semibold">Dados do Remetente</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sender_name">Nome / Razão Social *</Label>
                  <Input
                    id="sender_name"
                    value={formData.sender_config.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          name: e.target.value,
                        },
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sender_document">CPF / CNPJ *</Label>
                  <Input
                    id="sender_document"
                    value={formData.sender_config.document}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          document: e.target.value,
                        },
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sender_email">Email *</Label>
                  <Input
                    id="sender_email"
                    type="email"
                    value={formData.sender_config.email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          email: e.target.value,
                        },
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sender_phone">Telefone *</Label>
                  <Input
                    id="sender_phone"
                    value={formData.sender_config.phone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          phone: e.target.value,
                        },
                      })
                    }
                    placeholder="11999999999"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Endereço do Remetente */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-semibold">Endereço do Remetente</h3>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postal_code">CEP *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="postal_code"
                      value={formData.sender_config.address.postal_code}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sender_config: {
                            ...formData.sender_config,
                            address: {
                              ...formData.sender_config.address,
                              postal_code: e.target.value,
                            },
                          },
                        })
                      }
                      placeholder="00000-000"
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        searchCEP(formData.sender_config.address.postal_code)
                      }
                    >
                      Buscar
                    </Button>
                  </div>
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="street">Rua *</Label>
                  <Input
                    id="street"
                    value={formData.sender_config.address.street}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          address: {
                            ...formData.sender_config.address,
                            street: e.target.value,
                          },
                        },
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="number">Número *</Label>
                  <Input
                    id="number"
                    value={formData.sender_config.address.number}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          address: {
                            ...formData.sender_config.address,
                            number: e.target.value,
                          },
                        },
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="complement">Complemento</Label>
                  <Input
                    id="complement"
                    value={formData.sender_config.address.complement || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          address: {
                            ...formData.sender_config.address,
                            complement: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="district">Bairro *</Label>
                  <Input
                    id="district"
                    value={formData.sender_config.address.district}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          address: {
                            ...formData.sender_config.address,
                            district: e.target.value,
                          },
                        },
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Cidade *</Label>
                  <Input
                    id="city"
                    value={formData.sender_config.address.city}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          address: {
                            ...formData.sender_config.address,
                            city: e.target.value,
                          },
                        },
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">Estado *</Label>
                  <Input
                    id="state"
                    value={formData.sender_config.address.state}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_config: {
                          ...formData.sender_config,
                          address: {
                            ...formData.sender_config.address,
                            state: e.target.value.toUpperCase(),
                          },
                        },
                      })
                    }
                    placeholder="SP"
                    maxLength={2}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => validateMutation.mutate()}
                disabled={validateMutation.isPending || !formData.api_token}
              >
                {validateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Validar Token
              </Button>

              <Button
                type="submit"
                disabled={saveMutation.isPending || !formData.api_token}
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
