import { useTenantContext } from '@/contexts/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, MessageSquare, CreditCard, Truck, Building2, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface IntegrationStatus {
  name: string;
  icon: React.ReactNode;
  isActive: boolean;
  details?: string;
  provider?: string;
}

export default function IntegrationsChecklist() {
  const { tenant } = useTenantContext();
  const tenantId = tenant?.id || '';

  // Z-API Status
  const { data: zapiIntegration, isLoading: zapiLoading } = useQuery({
    queryKey: ['zapi-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_whatsapp')
        .select('is_active, connected_phone, provider')
        .eq('tenant_id', tenantId)
        .eq('provider', 'zapi')
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Mercado Pago Status
  const { data: mpIntegration, isLoading: mpLoading } = useQuery({
    queryKey: ['mp-checklist-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_mp')
        .select('is_active, environment')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Pagar.me Status
  const { data: pagarmeIntegration, isLoading: pagarmeLoading } = useQuery({
    queryKey: ['pagarme-checklist-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_pagarme')
        .select('is_active, environment')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Melhor Envio Status
  const { data: shippingIntegration, isLoading: shippingLoading } = useQuery({
    queryKey: ['shipping-checklist-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('shipping_integrations')
        .select('is_active, sandbox, from_cep')
        .eq('tenant_id', tenantId)
        .eq('provider', 'melhor_envio')
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Bling ERP Status
  const { data: blingIntegration, isLoading: blingLoading } = useQuery({
    queryKey: ['bling-checklist-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_bling')
        .select('is_active, sync_orders, sync_products, sync_stock, sync_invoices, sync_marketplaces, sync_ecommerce, sync_logistics')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const isLoading = zapiLoading || mpLoading || pagarmeLoading || shippingLoading || blingLoading;

  // Contagem de módulos ativos do Bling
  const blingActiveModules = blingIntegration ? [
    blingIntegration.sync_orders,
    blingIntegration.sync_products,
    blingIntegration.sync_stock,
    blingIntegration.sync_invoices,
    blingIntegration.sync_marketplaces,
    blingIntegration.sync_ecommerce,
    blingIntegration.sync_logistics,
  ].filter(Boolean).length : 0;

  // Determinar qual integração de pagamento está ativa
  const activePaymentProvider = mpIntegration?.is_active 
    ? 'mercado_pago' 
    : pagarmeIntegration?.is_active 
      ? 'pagarme' 
      : null;

  const integrations: IntegrationStatus[] = [
    {
      name: 'Bling ERP',
      icon: <Building2 className="h-5 w-5" />,
      isActive: blingIntegration?.is_active || false,
      details: blingIntegration?.is_active 
        ? `${blingActiveModules} módulo(s) ativo(s)` 
        : 'Não configurado',
    },
    {
      name: 'Z-API (WhatsApp)',
      icon: <MessageSquare className="h-5 w-5" />,
      isActive: zapiIntegration?.is_active || false,
      details: zapiIntegration?.connected_phone 
        ? `Conectado: ${zapiIntegration.connected_phone}` 
        : 'Não conectado',
    },
    {
      name: 'Pagamento',
      icon: activePaymentProvider === 'pagarme' ? <Wallet className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />,
      isActive: !!activePaymentProvider,
      details: activePaymentProvider === 'mercado_pago' 
        ? `Mercado Pago (${mpIntegration?.environment === 'production' ? 'Produção' : 'Sandbox'})`
        : activePaymentProvider === 'pagarme'
          ? `Pagar.me (${pagarmeIntegration?.environment === 'production' ? 'Produção' : 'Sandbox'})`
          : 'Nenhum configurado',
      provider: activePaymentProvider || undefined,
    },
    {
      name: 'Melhor Envio',
      icon: <Truck className="h-5 w-5" />,
      isActive: shippingIntegration?.is_active || false,
      details: shippingIntegration?.is_active 
        ? `CEP: ${shippingIntegration.from_cep || 'N/A'} ${shippingIntegration.sandbox ? '(Sandbox)' : '(Produção)'}` 
        : 'Não configurado',
    },
  ];

  if (!tenantId) {
    return null;
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          Checklist de Integrações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          integrations.map((integration) => (
            <div
              key={integration.name}
              className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
            >
              <div className="flex items-center gap-3">
                <div className={integration.isActive ? 'text-green-500' : 'text-muted-foreground'}>
                  {integration.icon}
                </div>
                <div>
                  <p className="font-medium text-sm">{integration.name}</p>
                  <p className="text-xs text-muted-foreground">{integration.details}</p>
                </div>
              </div>
              {integration.isActive ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
