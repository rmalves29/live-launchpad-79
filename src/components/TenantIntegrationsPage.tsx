/**
 * Página de Integrações por Tenant
 * Permite configurar Mercado Pago, Pagar.me, App Max, Melhor Envio, Mandae, Correios, MeusCorreios, Bling ERP e Instagram Live
 * Usa automaticamente o tenant do usuário logado
 * IMPORTANTE: Apenas UMA integração de pagamento pode estar ativa por vez
 */

import { useTenantContext } from '@/contexts/TenantContext';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Loader2, CreditCard, Truck, Building2, Package, Wallet, Mail, Zap, Instagram, Printer, MessageSquare, ShoppingBag, Sparkles } from 'lucide-react';
import PaymentIntegrations from '@/components/integrations/PaymentIntegrations';
import PagarMeIntegration from '@/components/integrations/PagarMeIntegration';
import AppmaxIntegration from '@/components/integrations/AppmaxIntegration';
import InfinitePayIntegration from '@/components/integrations/InfinitePayIntegration';
import ShippingIntegrations from '@/components/integrations/ShippingIntegrations';
import MandaeIntegration from '@/components/integrations/MandaeIntegration';
import SuperFreteIntegration from '@/components/integrations/SuperFreteIntegration';
import CorreiosIntegration from '@/components/integrations/CorreiosIntegration';
import MeusCorreiosIntegration from '@/components/integrations/MeusCorreiosIntegration';
import BlingIntegration from '@/components/integrations/BlingIntegration';
import OlistIntegration from '@/components/integrations/OlistIntegration';
import OmieIntegration from '@/components/integrations/OmieIntegration';
import InstagramIntegration from '@/components/integrations/InstagramIntegration';

import BagyIntegration from '@/components/integrations/BagyIntegration';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function TenantIntegrationsPage() {
  const { tenant, loading: tenantLoading, error: tenantError } = useTenantContext();
  const { profile, isLoading: authLoading } = useAuth();
  const tenantId = tenant?.id || '';

  console.log('[TenantIntegrationsPage] Estado atual:', {
    tenantId,
    tenantName: tenant?.name,
    tenantSlug: tenant?.slug,
    tenantLoading,
    authLoading,
    tenantError,
    profileRole: profile?.role,
    previewTenantId: localStorage.getItem('previewTenantId')
  });

  const { data: mpIntegration } = useQuery({
    queryKey: ['mp-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_mp').select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: melhorEnvioIntegration } = useQuery({
    queryKey: ['melhor-envio-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('shipping_integrations').select('is_active').eq('tenant_id', tenantId).eq('provider', 'melhor_envio').maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: mandaeIntegration } = useQuery({
    queryKey: ['mandae-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('shipping_integrations').select('is_active').eq('tenant_id', tenantId).eq('provider', 'mandae').maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: superfreteIntegration } = useQuery({
    queryKey: ['superfrete-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('shipping_integrations').select('is_active').eq('tenant_id', tenantId).eq('provider', 'superfrete').maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: blingIntegration } = useQuery({
    queryKey: ['bling-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_bling').select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: pagarmeIntegration } = useQuery({
    queryKey: ['pagarme-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_pagarme').select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: correiosIntegration } = useQuery({
    queryKey: ['correios-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('shipping_integrations').select('is_active').eq('tenant_id', tenantId).eq('provider', 'correios').maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: meusCorreiosIntegration } = useQuery({
    queryKey: ['meuscorreios-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('shipping_integrations').select('is_active').eq('tenant_id', tenantId).eq('provider', 'meuscorreios').maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: appmaxIntegration } = useQuery({
    queryKey: ['appmax-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_appmax').select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: infinitepayIntegration } = useQuery({
    queryKey: ['infinitepay-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_infinitepay' as any).select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data as { is_active: boolean } | null;
    },
    enabled: !!tenantId,
  });

  const { data: instagramIntegration } = useQuery({
    queryKey: ['instagram-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_instagram').select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: olistIntegration } = useQuery({
    queryKey: ['olist-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_olist' as any).select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data as { is_active: boolean } | null;
    },
    enabled: !!tenantId,
  });

  const { data: omieIntegration } = useQuery({
    queryKey: ['omie-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_omie' as any).select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data as { is_active: boolean } | null;
    },
    enabled: !!tenantId,
  });

  const { data: bagyIntegration } = useQuery({
    queryKey: ['bagy-status', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('integration_bagy' as any).select('is_active').eq('tenant_id', tenantId).maybeSingle();
      return data as { is_active: boolean } | null;
    },
    enabled: !!tenantId,
  });

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

  if (tenantError) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription><strong>Erro:</strong> {tenantError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!tenant || !tenantId) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription><strong>Erro:</strong> Você precisa estar logado em uma empresa para acessar as integrações.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const ALLOWED_ADVANCED_SLUGS = ['orderzap', 'app', 'franciscajoias'];
  const showAdvancedIntegrations = ALLOWED_ADVANCED_SLUGS.includes(tenant.slug || '');

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-3xl font-bold mb-2">Integrações</h1>
      <p className="text-muted-foreground mb-6">
        Configure suas integrações de pagamento, envio e ERP para a empresa <strong>{tenant.name}</strong>
      </p>

      <Tabs defaultValue={new URLSearchParams(window.location.search).get('instagram_success') || new URLSearchParams(window.location.search).get('instagram_error') ? 'instagram' : 'bling'} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full">
          <TabsTrigger value="instagram" className="flex items-center gap-2">
            <Instagram className="h-4 w-4" />
            <span className="hidden sm:inline">Instagram</span>
            <span className="sm:hidden">IG</span>
            {instagramIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          {showAdvancedIntegrations && (
            <TabsTrigger value="bagy" className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">Bagy</span>
              <span className="sm:hidden">BG</span>
              {bagyIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </TabsTrigger>
          )}
          <TabsTrigger value="bling" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Bling ERP</span>
            <span className="sm:hidden">Bling</span>
            {blingIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="olist" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Tiny ERP</span>
            <span className="sm:hidden">Tiny</span>
            {olistIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="omie" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Omie ERP</span>
            <span className="sm:hidden">Omie</span>
            {omieIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="mercadopago" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Mercado Pago</span>
            <span className="sm:hidden">MP</span>
            {mpIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="pagarme" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Pagar.me</span>
            <span className="sm:hidden">PG</span>
            {pagarmeIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="appmax" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">App Max</span>
            <span className="sm:hidden">AM</span>
            {appmaxIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="infinitepay" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">InfinitePay</span>
            <span className="sm:hidden">IP</span>
            {infinitepayIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="melhorenvio" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">Melhor Envio</span>
            <span className="sm:hidden">ME</span>
            {melhorEnvioIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="mandae" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Mandae</span>
            <span className="sm:hidden">MD</span>
            {mandaeIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="superfrete" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">SuperFrete</span>
            <span className="sm:hidden">SF</span>
            {superfreteIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="correios" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Correios</span>
            <span className="sm:hidden">CR</span>
            {correiosIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="meuscorreios" className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Meus Correios</span>
            <span className="sm:hidden">MC</span>
            {meusCorreiosIntegration?.is_active && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instagram" className="mt-6">
          <InstagramIntegration tenantId={tenantId} tenantSlug={tenant?.slug} />
        </TabsContent>
        {showAdvancedIntegrations && (
          <TabsContent value="bagy" className="mt-6">
            <BagyIntegration tenantId={tenantId} />
          </TabsContent>
        )}
        <TabsContent value="bling" className="mt-6">
          <BlingIntegration tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="olist" className="mt-6">
          <OlistIntegration tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="omie" className="mt-6">
          <OmieIntegration tenantId={tenantId} />
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
        <TabsContent value="infinitepay" className="mt-6">
          <InfinitePayIntegration tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="melhorenvio" className="mt-6">
          <ShippingIntegrations tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="mandae" className="mt-6">
          <MandaeIntegration tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="superfrete" className="mt-6">
          <SuperFreteIntegration tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="correios" className="mt-6">
          <CorreiosIntegration tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="meuscorreios" className="mt-6">
          <MeusCorreiosIntegration tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
