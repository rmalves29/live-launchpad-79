/**
 * Página de Integrações por Tenant
 * Permite configurar Mercado Pago, Pagar.me, App Max, Melhor Envio, Mandae, Correios, Bling ERP e Manychat
 * Usa automaticamente o tenant do usuário logado
 * Bling ERP só visível para super_admin até validação completa
 * Manychat: visível apenas para tenant "Mania de Mulher" ou super_admin
 * IMPORTANTE: Apenas UMA integração de pagamento pode estar ativa por vez
 */

import { useTenantContext } from '@/contexts/TenantContext';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Loader2, CreditCard, Truck, Building2, Package, Wallet, Mail, Bot, Zap } from 'lucide-react';
import PaymentIntegrations from '@/components/integrations/PaymentIntegrations';
import PagarMeIntegration from '@/components/integrations/PagarMeIntegration';
import AppmaxIntegration from '@/components/integrations/AppmaxIntegration';
import ShippingIntegrations from '@/components/integrations/ShippingIntegrations';
import MandaeIntegration from '@/components/integrations/MandaeIntegration';
import CorreiosIntegration from '@/components/integrations/CorreiosIntegration';
import BlingIntegration from '@/components/integrations/BlingIntegration';
import ManychatIntegration from '@/components/integrations/ManychatIntegration';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function TenantIntegrationsPage() {
  // Todos os hooks devem estar no topo, antes de qualquer return condicional
  const { tenant, loading: tenantLoading, error: tenantError } = useTenantContext();
  const { profile, isLoading: authLoading } = useAuth();
  const tenantId = tenant?.id || '';

  // MANIA DE MULHER ID - definido aqui para usar nas queries
  const MANIA_DE_MULHER_TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
  const isManiaDeMulher = tenantId === MANIA_DE_MULHER_TENANT_ID;
  const isSuperAdmin = profile?.role === 'super_admin';
  const showManychat = isManiaDeMulher || isSuperAdmin;

  // Debug: mostrar qual tenant está sendo usado
  console.log('[TenantIntegrationsPage] Estado atual:', {
    tenantId,
    tenantName: tenant?.name,
    tenantSlug: tenant?.slug,
    tenantLoading,
    authLoading,
    tenantError,
    profileRole: profile?.role,
    showManychat,
    previewTenantId: localStorage.getItem('previewTenantId')
  });

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

  const { data: melhorEnvioIntegration } = useQuery({
    queryKey: ['melhor-envio-status', tenantId],
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

  const { data: mandaeIntegration } = useQuery({
    queryKey: ['mandae-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('shipping_integrations')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .eq('provider', 'mandae')
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

  // Pagar.me Status
  const { data: pagarmeIntegration } = useQuery({
    queryKey: ['pagarme-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_pagarme')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Correios Status
  const { data: correiosIntegration } = useQuery({
    queryKey: ['correios-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('shipping_integrations')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .eq('provider', 'correios')
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Manychat Status (apenas para Mania de Mulher ou super_admin)
  // MANIA_DE_MULHER_TENANT_ID já definido acima

  const { data: manychatIntegration } = useQuery({
    queryKey: ['manychat-status', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_manychat')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) {
        console.error('[TenantIntegrationsPage] Erro ao buscar Manychat:', error);
      }
      return data;
    },
    enabled: !!tenantId && showManychat,
  });

  // App Max Status
  const { data: appmaxIntegration } = useQuery({
    queryKey: ['appmax-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_appmax')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Verificar se auth ou tenant está carregando
  if (authLoading || tenantLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando integrações...</p>
        </div>
      </div>
    );
  }

  // Mostrar erro se houver
  if (tenantError) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Erro:</strong> {tenantError}
          </AlertDescription>
        </Alert>
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
        <TabsList className={`grid w-full ${showManychat ? 'grid-cols-8' : 'grid-cols-7'}`}>
          <TabsTrigger value="bling" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Bling ERP</span>
            <span className="sm:hidden">Bling</span>
            {blingIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </TabsTrigger>
          <TabsTrigger value="mercadopago" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Mercado Pago</span>
            <span className="sm:hidden">MP</span>
            {mpIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </TabsTrigger>
          <TabsTrigger value="pagarme" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Pagar.me</span>
            <span className="sm:hidden">PG</span>
            {pagarmeIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </TabsTrigger>
          <TabsTrigger value="appmax" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">App Max</span>
            <span className="sm:hidden">AM</span>
            {appmaxIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </TabsTrigger>
          <TabsTrigger value="melhorenvio" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">Melhor Envio</span>
            <span className="sm:hidden">ME</span>
            {melhorEnvioIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </TabsTrigger>
          <TabsTrigger value="mandae" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Mandae</span>
            <span className="sm:hidden">MD</span>
            {mandaeIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </TabsTrigger>
          <TabsTrigger value="correios" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Correios</span>
            <span className="sm:hidden">CR</span>
            {correiosIntegration?.is_active && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </TabsTrigger>
          {showManychat && (
            <TabsTrigger value="manychat" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Manychat</span>
              <span className="sm:hidden">MC</span>
              {manychatIntegration?.is_active && (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="bling" className="mt-6">
          <BlingIntegration tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="mercadopago" className="mt-6">
          <PaymentIntegrations tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="pagarme" className="mt-6">
          <PagarMeIntegration tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="appmax" className="mt-6">
          <AppmaxIntegration tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="melhorenvio" className="mt-6">
          <ShippingIntegrations tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="mandae" className="mt-6">
          <MandaeIntegration tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="correios" className="mt-6">
          <CorreiosIntegration tenantId={tenantId} />
        </TabsContent>

        {showManychat && (
          <TabsContent value="manychat" className="mt-6">
            <ManychatIntegration tenantId={tenantId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
