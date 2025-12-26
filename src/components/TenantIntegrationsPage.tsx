/**
 * Página de Integrações por Tenant
 * Permite configurar Mercado Pago, Melhor Envio e Bling ERP
 * Usa automaticamente o tenant do usuário logado
 */

import { useTenantContext } from '@/contexts/TenantContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Loader2, CreditCard, Truck, Building2 } from 'lucide-react';
import PaymentIntegrations from '@/components/integrations/PaymentIntegrations';
import ShippingIntegrations from '@/components/integrations/ShippingIntegrations';
import BlingIntegration from '@/components/integrations/BlingIntegration';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function TenantIntegrationsPage() {
  const { tenant, loading: tenantLoading } = useTenantContext();
  const tenantId = tenant?.id || '';

  // Buscar status das integrações
  const { data: mpIntegration } = useQuery({
    queryKey: ['mp-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_mp')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: shippingIntegration } = useQuery({
    queryKey: ['shipping-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('shipping_integrations')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .eq('provider', 'melhor_envio')
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: blingIntegration } = useQuery({
    queryKey: ['bling-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_bling')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Verificar se tenant está carregando
  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Redirecionar se não tiver tenant
  if (!tenant || !tenantId) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Erro:</strong> Você precisa estar logado em uma empresa para acessar as integrações.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">Integrações</h1>
      <p className="text-muted-foreground mb-6">
        Configure suas integrações de pagamento, envio e ERP para a empresa <strong>{tenant.name}</strong>
      </p>

      <Tabs defaultValue="bling" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="bling" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Bling ERP
            {blingIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </TabsTrigger>
          <TabsTrigger value="mercadopago" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Mercado Pago
            {mpIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </TabsTrigger>
          <TabsTrigger value="melhorenvio" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Melhor Envio
            {shippingIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bling" className="mt-6">
          <BlingIntegration tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="mercadopago" className="mt-6">
          <PaymentIntegrations tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="melhorenvio" className="mt-6">
          <ShippingIntegrations tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
