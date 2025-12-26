/**
 * Componente de integração com Bling ERP
 * Permite configurar credenciais e selecionar módulos para sincronização
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  Loader2, 
  Save, 
  CheckCircle2, 
  XCircle, 
  ShoppingCart, 
  Package, 
  FileText, 
  Store, 
  ShoppingBag, 
  Truck,
  ExternalLink,
  Info
} from 'lucide-react';

interface BlingIntegrationProps {
  tenantId: string;
}

interface BlingIntegrationData {
  id: string;
  tenant_id: string;
  client_id: string | null;
  client_secret: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  sync_orders: boolean;
  sync_products: boolean;
  sync_stock: boolean;
  sync_invoices: boolean;
  sync_marketplaces: boolean;
  sync_ecommerce: boolean;
  sync_logistics: boolean;
  environment: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

const SYNC_MODULES = [
  {
    key: 'sync_orders',
    label: 'Gestão de Pedidos',
    description: 'Sincronizar pedidos do site, marketplaces e vendas manuais',
    icon: ShoppingCart,
  },
  {
    key: 'sync_products',
    label: 'Produtos',
    description: 'Sincronizar catálogo de produtos e variações',
    icon: Package,
  },
  {
    key: 'sync_stock',
    label: 'Controle de Estoque',
    description: 'Sincronizar estoque em tempo real',
    icon: Package,
  },
  {
    key: 'sync_invoices',
    label: 'Notas Fiscais',
    description: 'Emissão de NF-e e NFC-e',
    icon: FileText,
  },
  {
    key: 'sync_marketplaces',
    label: 'Marketplaces',
    description: 'Integração com Shopee, Mercado Livre, Magalu, Amazon, etc.',
    icon: Store,
  },
  {
    key: 'sync_ecommerce',
    label: 'E-commerces',
    description: 'Integração com Tray, Shopify, WooCommerce, Nuvemshop...',
    icon: ShoppingBag,
  },
  {
    key: 'sync_logistics',
    label: 'Logística',
    description: 'Integração com Correios, Melhor Envio, transportadoras',
    icon: Truck,
  },
] as const;

export default function BlingIntegration({ tenantId }: BlingIntegrationProps) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [modules, setModules] = useState<Record<string, boolean>>({
    sync_orders: false,
    sync_products: false,
    sync_stock: false,
    sync_invoices: false,
    sync_marketplaces: false,
    sync_ecommerce: false,
    sync_logistics: false,
  });

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['bling-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_bling')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setClientId(data.client_id || '');
        setClientSecret(data.client_secret || '');
        setModules({
          sync_orders: data.sync_orders,
          sync_products: data.sync_products,
          sync_stock: data.sync_stock,
          sync_invoices: data.sync_invoices,
          sync_marketplaces: data.sync_marketplaces,
          sync_ecommerce: data.sync_ecommerce,
          sync_logistics: data.sync_logistics,
        });
      }
      
      return data as BlingIntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Mutation para salvar/atualizar
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: tenantId,
        client_id: clientId || null,
        client_secret: clientSecret || null,
        sync_orders: modules.sync_orders,
        sync_products: modules.sync_products,
        sync_stock: modules.sync_stock,
        sync_invoices: modules.sync_invoices,
        sync_marketplaces: modules.sync_marketplaces,
        sync_ecommerce: modules.sync_ecommerce,
        sync_logistics: modules.sync_logistics,
        is_active: !!(clientId && clientSecret),
        updated_at: new Date().toISOString(),
      };

      if (integration?.id) {
        const { error } = await supabase
          .from('integration_bling')
          .update(payload)
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_bling')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bling-integration', tenantId] });
      toast.success('Configuração do Bling salva com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao salvar integração Bling:', error);
      toast.error('Erro ao salvar configuração');
    },
  });

  // Toggle módulo
  const toggleModule = (key: string) => {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Contagem de módulos ativos
  const activeModulesCount = Object.values(modules).filter(Boolean).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-blue-600">B</span>
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Bling ERP
                  {integration?.is_active ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Conectado
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      Não configurado
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Sistema de gestão empresarial completo
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://developer.bling.com.br/aplicativos', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Portal Bling
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credenciais da API</CardTitle>
          <CardDescription>
            Obtenha suas credenciais no{' '}
            <a 
              href="https://developer.bling.com.br/aplicativos" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Portal de Desenvolvedores do Bling
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                type="text"
                placeholder="Seu Client ID do Bling"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_secret">Client Secret</Label>
              <Input
                id="client_secret"
                type="password"
                placeholder="Seu Client Secret do Bling"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Para obter as credenciais, crie um aplicativo no Portal de Desenvolvedores do Bling 
              e copie o Client ID e Client Secret gerados.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Módulos de Sincronização */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Módulos de Integração</span>
            <Badge variant="outline">
              {activeModulesCount} de {SYNC_MODULES.length} ativos
            </Badge>
          </CardTitle>
          <CardDescription>
            Selecione quais funcionalidades você deseja sincronizar com o Bling
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {SYNC_MODULES.map((module, index) => (
              <div key={module.key}>
                {index > 0 && <Separator className="my-4" />}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <module.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <Label htmlFor={module.key} className="text-base font-medium cursor-pointer">
                        {module.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {module.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id={module.key}
                    checked={modules[module.key]}
                    onCheckedChange={() => toggleModule(module.key)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Última sincronização */}
      {integration?.last_sync_at && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>
            Última sincronização: {new Date(integration.last_sync_at).toLocaleString('pt-BR')}
          </AlertDescription>
        </Alert>
      )}

      {/* Botão de salvar */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          size="lg"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configuração
        </Button>
      </div>
    </div>
  );
}
